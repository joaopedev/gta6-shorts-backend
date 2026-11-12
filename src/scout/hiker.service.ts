import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type JsonObject = Record<string, unknown>;
export type HikerMedia = {
  sourceMediaId: string;
  shortcode: string | null;
  caption: string | null;
  creatorUsername: string | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  thumbnailUrl: string | null;
  sourceVideoUrl: string | null;
  sourcePermalink: string | null;
  likeCount: number;
  commentCount: number;
  playCount: number;
  durationSeconds: number | null;
  audioTitle: string | null;
  sourcePublishedAt: Date | null;
};

@Injectable()
export class HikerService {
  constructor(private readonly config: ConfigService) {}

  async searchReels(query: string, pages: number) {
    const apiKey = this.config.get<string>('HIKER_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Configure HIKER_API_KEY no arquivo .env',
      );
    const baseUrl =
      this.config.get<string>('HIKER_API_BASE_URL') ||
      'https://api.hikerapi.com';
    const found = new Map<string, HikerMedia>();
    let requestsUsed = 0;
    let reelsMaxId: string | null = null;
    let rankToken: string | null = null;

    for (let page = 0; page < pages; page += 1) {
      const url = new URL('/v2/fbsearch/reels', baseUrl);
      url.searchParams.set('query', query);
      url.searchParams.set('safe_int', 'true');
      if (reelsMaxId) url.searchParams.set('reels_max_id', reelsMaxId);
      if (rankToken) url.searchParams.set('rank_token', rankToken);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'x-access-key': apiKey, accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (error) {
        throw new BadGatewayException(
          `HikerAPI indisponível: ${error instanceof Error ? error.message : 'falha de conexão'}`,
        );
      } finally {
        clearTimeout(timeout);
      }
      requestsUsed += 1;
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new BadGatewayException(
          `HikerAPI respondeu ${response.status}: ${detail || response.statusText}`,
        );
      }
      const body = (await response.json()) as JsonObject;
      extractHikerMedia(body).forEach((media) =>
        found.set(media.sourceMediaId, media),
      );
      reelsMaxId = asString(body.reels_max_id);
      rankToken = asString(body.rank_token);
      if (body.has_more !== true || !reelsMaxId) break;
    }
    return { items: [...found.values()], requestsUsed };
  }
}

export function extractHikerMedia(input: unknown): HikerMedia[] {
  const nodes: JsonObject[] = [];
  const visited = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (
      depth > 12 ||
      value === null ||
      typeof value !== 'object' ||
      visited.has(value)
    )
      return;
    visited.add(value);
    if (Array.isArray(value))
      return value.forEach((entry) => visit(entry, depth + 1));
    const object = value as JsonObject;
    const isVideo =
      Array.isArray(object.video_versions) ||
      object.media_type === 2 ||
      ['clips', 'reels'].includes(String(object.product_type));
    if ((object.pk ?? object.id ?? object.strong_id__) && isVideo)
      nodes.push(object);
    Object.values(object).forEach((entry) => visit(entry, depth + 1));
  };
  visit(input, 0);
  const unique = new Map<string, HikerMedia>();
  nodes.forEach((node) => {
    const media = normalizeHikerMedia(node);
    if (media) unique.set(media.sourceMediaId, media);
  });
  return [...unique.values()];
}

export function normalizeHikerMedia(media: JsonObject): HikerMedia | null {
  const sourceMediaId = asString(media.pk ?? media.id ?? media.strong_id__);
  if (!sourceMediaId) return null;
  const user = asObject(media.user) ?? asObject(media.owner) ?? {};
  const caption = asObject(media.caption);
  const shortcode = asString(media.code ?? media.shortcode);
  const takenAt = asNumber(media.taken_at ?? media.taken_at_timestamp);
  const publishedAt = takenAt
    ? new Date(takenAt > 10_000_000_000 ? takenAt : takenAt * 1000)
    : null;
  const videos = arrayObjects(media.video_versions);
  const images = arrayObjects(asObject(media.image_versions2)?.candidates);
  return {
    sourceMediaId,
    shortcode,
    caption: asString(caption?.text ?? media.caption_text),
    creatorUsername: asString(user.username),
    creatorName: asString(user.full_name),
    creatorAvatarUrl: asString(user.profile_pic_url ?? user.profile_pic_url_hd),
    thumbnailUrl:
      rankedUrl(images) ?? asString(media.thumbnail_url ?? media.display_url),
    sourceVideoUrl: rankedUrl(videos) ?? asString(media.video_url),
    sourcePermalink: shortcode
      ? `https://www.instagram.com/reel/${shortcode}/`
      : null,
    likeCount: count(media.like_count),
    commentCount: count(media.comment_count),
    playCount: count(
      media.play_count ?? media.view_count ?? media.video_view_count,
    ),
    durationSeconds: asNumber(
      media.video_duration ?? media.clip_duration ?? media.duration,
    ),
    audioTitle:
      nestedString(media, [
        'clips_metadata',
        'music_info',
        'music_asset_info',
        'title',
      ]) ??
      nestedString(media, [
        'clips_metadata',
        'original_sound_info',
        'original_audio_title',
      ]),
    sourcePublishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  };
}

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim()
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : null;
const asNumber = (value: unknown): number | null => {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const count = (value: unknown) =>
  Math.max(0, Math.min(Math.round(asNumber(value) ?? 0), 2_147_483_647));
const arrayObjects = (value: unknown): JsonObject[] =>
  Array.isArray(value)
    ? value.map(asObject).filter((item): item is JsonObject => Boolean(item))
    : [];
const rankedUrl = (items: JsonObject[]) =>
  items
    .map((item) => ({
      url: asString(item.url),
      area: count(item.width) * count(item.height),
    }))
    .filter((item): item is { url: string; area: number } => Boolean(item.url))
    .sort((a, b) => b.area - a.area)[0]?.url ?? null;
function nestedString(object: JsonObject, path: string[]) {
  let current: unknown = object;
  for (const part of path) {
    if (current && typeof current === 'object')
      current = (current as JsonObject)[part];
    else return null;
  }
  return asString(current);
}
