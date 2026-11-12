import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { google } from 'googleapis';
import { Repository } from 'typeorm';
import { CryptoService } from './crypto.service';
import { PublishItemDto } from './dto/publish-item.dto';
import { MediaItem } from './entities/media-item.entity';
import { YoutubeCredential } from './entities/youtube-credential.entity';

@Injectable()
export class YoutubeService {
  private readonly states = new Map<string, number>();
  constructor(
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    @InjectRepository(YoutubeCredential)
    private readonly credentials: Repository<YoutubeCredential>,
  ) {}

  async status() {
    const saved = await this.credentials.findOneBy({ id: 'default' });
    return {
      configured: Boolean(
        this.config.get('YOUTUBE_CLIENT_ID') &&
        this.config.get('YOUTUBE_CLIENT_SECRET'),
      ),
      connected: Boolean(saved?.refreshToken),
      updatedAt: saved?.updatedAt ?? null,
    };
  }

  authUrl() {
    const state = randomUUID();
    this.states.set(state, Date.now() + 10 * 60_000);
    for (const [key, expires] of this.states)
      if (expires < Date.now()) this.states.delete(key);
    return {
      url: this.client().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state,
        scope: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
        ],
      }),
    };
  }

  async callback(code: string, state: string) {
    const expires = this.states.get(state);
    this.states.delete(state);
    if (!expires || expires < Date.now())
      throw new BadRequestException('Estado OAuth inválido ou expirado');
    const client = this.client();
    const { tokens } = await client.getToken(code);
    const current = await this.credentials.findOneBy({ id: 'default' });
    const entity = current ?? this.credentials.create({ id: 'default' });
    entity.accessToken = this.crypto.encrypt(tokens.access_token);
    entity.refreshToken = this.crypto.encrypt(
      tokens.refresh_token ??
        (current?.refreshToken
          ? this.crypto.decrypt(current.refreshToken)
          : null),
    );
    entity.expiryDate = tokens.expiry_date ?? null;
    entity.scope = tokens.scope ?? null;
    entity.tokenType = tokens.token_type ?? null;
    await this.credentials.save(entity);
  }

  async disconnect() {
    await this.credentials.delete({ id: 'default' });
    return { connected: false };
  }

  async publish(item: MediaItem, input: PublishItemDto) {
    if (!input.rightsConfirmed || !item.rightsConfirmed)
      throw new BadRequestException(
        'Confirme a licença ou autorização da mídia',
      );
    const mediaPath = item.processedFilePath ?? item.localFilePath;
    if (!mediaPath)
      throw new BadRequestException('Baixe e revise o vídeo antes de publicar');
    const saved = await this.credentials.findOneBy({ id: 'default' });
    if (!saved?.refreshToken)
      throw new ServiceUnavailableException(
        'Conecte o canal do YouTube primeiro',
      );
    const client = this.client();
    client.setCredentials({
      access_token: this.crypto.decrypt(saved.accessToken),
      refresh_token: this.crypto.decrypt(saved.refreshToken),
      expiry_date: saved.expiryDate ?? undefined,
      scope: saved.scope ?? undefined,
      token_type: saved.tokenType ?? undefined,
    });
    client.on('tokens', (tokens) => {
      void this.saveRefresh(saved, tokens);
    });
    const title = input.title.toLowerCase().includes('#shorts')
      ? input.title
      : `${input.title.slice(0, 91).trim()} #Shorts`;
    const result = await google
      .youtube({ version: 'v3', auth: client })
      .videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description: input.description,
            tags: input.tags,
            categoryId: '20',
          },
          status: {
            privacyStatus: input.privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        },
        media: { body: createReadStream(mediaPath) },
      });
    if (!result.data.id)
      throw new Error('O YouTube não retornou o ID do vídeo');
    return result.data.id;
  }

  private client() {
    const id = this.config.get<string>('YOUTUBE_CLIENT_ID');
    const secret = this.config.get<string>('YOUTUBE_CLIENT_SECRET');
    if (!id || !secret)
      throw new ServiceUnavailableException(
        'Configure YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET',
      );
    return new google.auth.OAuth2(
      id,
      secret,
      this.config.get<string>('YOUTUBE_REDIRECT_URI') ||
        'http://localhost:4100/api/youtube/callback',
    );
  }

  private async saveRefresh(
    saved: YoutubeCredential,
    tokens: {
      access_token?: string | null;
      refresh_token?: string | null;
      expiry_date?: number | null;
    },
  ) {
    if (tokens.access_token)
      saved.accessToken = this.crypto.encrypt(tokens.access_token);
    if (tokens.refresh_token)
      saved.refreshToken = this.crypto.encrypt(tokens.refresh_token);
    if (tokens.expiry_date) saved.expiryDate = tokens.expiry_date;
    await this.credentials.save(saved);
  }
}
