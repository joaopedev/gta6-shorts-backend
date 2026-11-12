import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { createReadStream } from 'fs';
import { mkdir, readdir } from 'fs/promises';
import OpenAI from 'openai';
import path from 'path';
import { Repository } from 'typeorm';
import { CreateCutProjectDto } from './dto/create-cut-project.dto';
import { CutCandidate } from './entities/cut-candidate.entity';
import { CutProject } from './entities/cut-project.entity';
import { MediaItem } from './entities/media-item.entity';

type TranscriptSegment = { start: number; end: number; text: string };
type SuggestedCut = {
  startSeconds: number;
  endSeconds: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
};

@Injectable()
export class YoutubeCutsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(CutProject)
    private readonly projects: Repository<CutProject>,
    @InjectRepository(CutCandidate)
    private readonly candidates: Repository<CutCandidate>,
    @InjectRepository(MediaItem)
    private readonly items: Repository<MediaItem>,
  ) {}

  async create(file: Express.Multer.File, input: CreateCutProjectDto) {
    if (!input.rightsConfirmed)
      throw new BadRequestException(
        'Confirme que você possui autorização para editar o vídeo',
      );
    if (input.maxSeconds <= input.minSeconds)
      throw new BadRequestException(
        'A duração máxima deve ser maior que a duração mínima',
      );
    if (input.sourceUrl) {
      const host = new URL(input.sourceUrl).hostname.toLowerCase();
      const isYoutube =
        host === 'youtu.be' ||
        host === 'youtube.com' ||
        host.endsWith('.youtube.com');
      if (!isYoutube)
        throw new BadRequestException('Informe uma URL válida do YouTube');
    }
    if (!ffmpegPath)
      throw new ServiceUnavailableException(
        'O FFmpeg não está disponível nesta plataforma',
      );
    const duration = await this.duration(file.path);
    if (!duration || duration < input.minSeconds)
      throw new BadRequestException('O vídeo é curto demais para os cortes');
    if (duration > 4 * 60 * 60)
      throw new BadRequestException('O limite por vídeo é de 4 horas');
    const project = await this.projects.save(
      this.projects.create({
        title: input.title.trim(),
        sourceUrl: input.sourceUrl?.trim() || null,
        originalFilePath: file.path,
        durationSeconds: duration,
        status: 'analyzing',
        language: input.language,
        requestedClips: input.clipCount,
        minSeconds: input.minSeconds,
        maxSeconds: input.maxSeconds,
        transcript: null,
        error: null,
      }),
    );
    void this.analyze(project.id).catch(() => undefined);
    return this.serialize(project, []);
  }

  async list() {
    const projects = await this.projects.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return Promise.all(
      projects.map(async (project) =>
        this.serialize(
          project,
          await this.candidates.find({
            where: { projectId: project.id },
            order: { score: 'DESC' },
          }),
        ),
      ),
    );
  }

  async project(id: string) {
    const project = await this.projects.findOneBy({ id });
    if (!project)
      throw new NotFoundException('Projeto de cortes não encontrado');
    const candidates = await this.candidates.find({
      where: { projectId: id },
      order: { score: 'DESC' },
    });
    return this.serialize(project, candidates);
  }

  async candidate(id: string) {
    const candidate = await this.candidates.findOneBy({ id });
    if (!candidate) throw new NotFoundException('Corte não encontrado');
    return candidate;
  }

  private async analyze(id: string) {
    const project = await this.projects.findOneBy({ id });
    if (!project) return;
    try {
      const directory = path.resolve(
        this.config.get<string>('CUTS_STORAGE_PATH') || '.data/cuts',
        project.id,
      );
      await mkdir(directory, { recursive: true });
      const segments = await this.transcribe(project, directory);
      const transcript = segments
        .map(
          (segment) =>
            `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`,
        )
        .join('\n');
      project.transcript = transcript;
      await this.projects.save(project);
      const suggestions = await this.chooseCuts(project, transcript);
      for (let index = 0; index < suggestions.length; index += 1) {
        const suggestion = suggestions[index];
        const output = path.join(directory, `cut-${index + 1}.mp4`);
        await this.renderCut(
          project.originalFilePath,
          output,
          suggestion.startSeconds,
          suggestion.endSeconds,
        );
        const item = await this.items.save(
          this.items.create({
            sourceMediaId: `youtube:${project.id}:${index + 1}`,
            shortcode: null,
            sourceNetwork: 'youtube',
            sourceQuery: `Cortes IA: ${project.title}`,
            targetCountryCode: 'YT',
            targetCountryName: 'YouTube',
            targetRegion: 'youtube',
            countryMatchBasis: 'uploaded_authorized_source',
            caption: `${suggestion.hook}\n\n${suggestion.reason}`,
            creatorUsername: 'cortes-ia',
            creatorName: project.title,
            creatorAvatarUrl: null,
            thumbnailUrl: null,
            sourceVideoUrl: null,
            sourcePermalink: project.sourceUrl,
            likeCount: 0,
            commentCount: 0,
            playCount: 0,
            durationSeconds: suggestion.endSeconds - suggestion.startSeconds,
            audioTitle: null,
            sourcePublishedAt: null,
            workflowStatus: 'downloaded',
            localFilePath: output,
            processedFilePath: output,
            narrationScript: null,
            narrationVoice: null,
            captionsBurned: false,
            processedKind: 'youtube_cut',
            editStartSeconds: suggestion.startSeconds,
            editEndSeconds: suggestion.endSeconds,
            audioMode: 'original',
            outputFormat: 'vertical',
            processedAt: new Date(),
            youtubeVideoId: null,
            youtubeUrl: null,
            processingError: null,
            rightsConfirmed: true,
            scanId: null,
            scan: null,
          }),
        );
        await this.candidates.save(
          this.candidates.create({
            projectId: project.id,
            startSeconds: suggestion.startSeconds,
            endSeconds: suggestion.endSeconds,
            title: suggestion.title,
            hook: suggestion.hook,
            reason: suggestion.reason,
            score: suggestion.score,
            filePath: output,
            mediaItemId: item.id,
          }),
        );
      }
      project.status = 'completed';
      project.error = null;
      await this.projects.save(project);
    } catch (error) {
      project.status = 'failed';
      project.error =
        error instanceof Error
          ? error.message.slice(0, 1600)
          : 'Falha desconhecida';
      await this.projects.save(project);
    }
  }

  private async transcribe(project: CutProject, directory: string) {
    const chunksPattern = path.join(directory, 'audio-%03d.mp3');
    await this.run(ffmpegPath as string, [
      '-y',
      '-i',
      project.originalFilePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '48k',
      '-f',
      'segment',
      '-segment_time',
      '600',
      '-reset_timestamps',
      '1',
      chunksPattern,
    ]);
    const chunks = (await readdir(directory))
      .filter((name) => /^audio-\d+\.mp3$/.test(name))
      .sort();
    if (!chunks.length)
      throw new Error('Não foi possível extrair o áudio do vídeo');
    const result: TranscriptSegment[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const response = (await this.client().audio.transcriptions.create({
        file: createReadStream(path.join(directory, chunks[index])),
        model:
          this.config.get<string>('OPENAI_TRANSCRIPTION_MODEL') || 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
        ...(project.language !== 'auto' ? { language: project.language } : {}),
      })) as unknown as {
        text: string;
        segments?: { start: number; end: number; text: string }[];
      };
      const offset = index * 600;
      if (response.segments?.length) {
        response.segments.forEach((segment) =>
          result.push({
            start: segment.start + offset,
            end: segment.end + offset,
            text: segment.text.trim(),
          }),
        );
      } else if (response.text.trim()) {
        result.push({
          start: offset,
          end: Math.min(offset + 600, project.durationSeconds),
          text: response.text.trim(),
        });
      }
    }
    return result;
  }

  private async chooseCuts(project: CutProject, transcript: string) {
    const response = await this.client().responses.create({
      model: this.config.get<string>('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
      instructions:
        'Você é um editor de vídeos curtos. Escolha trechos completos, com gancho forte, contexto suficiente e final satisfatório. Use somente os timestamps fornecidos, não invente falas e evite trechos sobrepostos.',
      input: [
        `Título: ${project.title}`,
        `Duração total: ${project.durationSeconds.toFixed(2)} segundos`,
        `Escolha até ${project.requestedClips} cortes entre ${project.minSeconds} e ${project.maxSeconds} segundos.`,
        'Transcrição com timestamps:',
        transcript.slice(0, 140_000),
      ].join('\n'),
      text: {
        format: {
          type: 'json_schema',
          name: 'best_video_cuts',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              clips: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    startSeconds: { type: 'number' },
                    endSeconds: { type: 'number' },
                    title: { type: 'string' },
                    hook: { type: 'string' },
                    reason: { type: 'string' },
                    score: { type: 'integer', minimum: 0, maximum: 100 },
                  },
                  required: [
                    'startSeconds',
                    'endSeconds',
                    'title',
                    'hook',
                    'reason',
                    'score',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['clips'],
            additionalProperties: false,
          },
        },
      },
    });
    const parsed = JSON.parse(response.output_text) as {
      clips: SuggestedCut[];
    };
    const normalized = parsed.clips
      .map((clip) => ({
        ...clip,
        startSeconds: Math.max(0, Number(clip.startSeconds)),
        endSeconds: Math.min(project.durationSeconds, Number(clip.endSeconds)),
        score: Math.max(0, Math.min(100, Math.round(Number(clip.score)))),
      }))
      .filter(
        (clip) =>
          Number.isFinite(clip.startSeconds) &&
          Number.isFinite(clip.endSeconds) &&
          clip.endSeconds - clip.startSeconds >= project.minSeconds &&
          clip.endSeconds - clip.startSeconds <= project.maxSeconds,
      )
      .sort((a, b) => b.score - a.score);
    const selected: SuggestedCut[] = [];
    for (const clip of normalized) {
      const overlaps = selected.some(
        (current) =>
          clip.startSeconds < current.endSeconds &&
          clip.endSeconds > current.startSeconds,
      );
      if (!overlaps) selected.push(clip);
      if (selected.length >= project.requestedClips) break;
    }
    if (!selected.length)
      throw new Error('A IA não encontrou cortes válidos dentro das durações');
    return selected;
  }

  private async renderCut(
    input: string,
    output: string,
    start: number,
    end: number,
  ) {
    await this.run(ffmpegPath as string, [
      '-y',
      '-ss',
      start.toFixed(3),
      '-i',
      input,
      '-t',
      (end - start).toFixed(3),
      '-vf',
      'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      output,
    ]);
  }

  private serialize(project: CutProject, candidates: CutCandidate[]) {
    return {
      id: project.id,
      title: project.title,
      sourceUrl: project.sourceUrl,
      durationSeconds: project.durationSeconds,
      status: project.status,
      requestedClips: project.requestedClips,
      minSeconds: project.minSeconds,
      maxSeconds: project.maxSeconds,
      error: project.error,
      createdAt: project.createdAt,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        startSeconds: candidate.startSeconds,
        endSeconds: candidate.endSeconds,
        title: candidate.title,
        hook: candidate.hook,
        reason: candidate.reason,
        score: candidate.score,
        mediaItemId: candidate.mediaItemId,
        previewUrl: candidate.mediaItemId
          ? `/api/items/${candidate.mediaItemId}/preview`
          : null,
      })),
    };
  }

  private client() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Configure OPENAI_API_KEY no .env do backend',
      );
    return new OpenAI({ apiKey });
  }

  private async duration(file: string) {
    const output = await this.run(ffprobeStatic.path, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    return Number.parseFloat(output.trim());
  }

  private run(command: string, args: string[]) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = (stdout + chunk.toString()).slice(-50_000);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-50_000);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else
          reject(
            new Error(
              `Falha ao processar a mídia (${code ?? 'sem código'}): ${stderr.slice(-1200)}`,
            ),
          );
      });
    });
  }
}
