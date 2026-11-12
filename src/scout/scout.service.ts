import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Repository } from 'typeorm';
import { COUNTRIES, findCountry } from './countries';
import { CreateScanDto } from './dto/create-scan.dto';
import { ListItemsDto } from './dto/list-items.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { MediaItem } from './entities/media-item.entity';
import { Scan } from './entities/scan.entity';
import { HikerService } from './hiker.service';

@Injectable()
export class ScoutService {
  private readonly activeScans = new Map<string, Promise<void>>();

  constructor(
    private readonly config: ConfigService,
    private readonly hiker: HikerService,
    @InjectRepository(Scan) private readonly scans: Repository<Scan>,
    @InjectRepository(MediaItem) private readonly items: Repository<MediaItem>,
  ) {}

  countries() {
    return COUNTRIES;
  }

  async createScan(input: CreateScanDto) {
    const keywords = [
      ...new Set(input.keywords.map((value) => value.trim()).filter(Boolean)),
    ];
    const countryCodes = [
      ...new Set(input.countryCodes.map((value) => value.toUpperCase())),
    ];
    const invalid = countryCodes.filter((code) => !findCountry(code));
    if (invalid.length)
      throw new BadRequestException(`Países inválidos: ${invalid.join(', ')}`);
    const estimatedRequests =
      keywords.length * countryCodes.length * input.pagesPerQuery;
    if (estimatedRequests > 60)
      throw new BadRequestException(
        `A varredura consumiria até ${estimatedRequests} chamadas. O limite por execução é 60.`,
      );
    const scan = await this.scans.save(
      this.scans.create({
        keywords,
        countryCodes,
        pagesPerQuery: input.pagesPerQuery,
        status: 'running',
        requestsUsed: 0,
        resultsFound: 0,
        newItems: 0,
        processedQueries: 0,
        error: null,
        completedAt: null,
      }),
    );
    this.startExecution(scan.id);
    return { ...scan, estimatedRequests };
  }

  listScans() {
    return this.scans.find({ order: { createdAt: 'DESC' }, take: 30 });
  }

  async scan(id: string) {
    const scan = await this.scans.findOneBy({ id });
    if (!scan) throw new NotFoundException('Varredura não encontrada');
    return scan;
  }

  async pauseScan(id: string) {
    const scan = await this.scan(id);
    if (scan.status === 'paused') return scan;
    if (scan.status !== 'running')
      throw new BadRequestException(
        'Somente uma varredura em andamento pode ser pausada',
      );
    scan.status = 'paused';
    return this.scans.save(scan);
  }

  async resumeScan(id: string) {
    const scan = await this.scan(id);
    if (scan.status === 'running') return scan;
    if (scan.status !== 'paused')
      throw new BadRequestException(
        'Somente uma varredura pausada pode ser retomada',
      );
    scan.status = 'running';
    scan.error = null;
    const resumed = await this.scans.save(scan);
    this.startExecution(id);
    return resumed;
  }

  async listItems(query: ListItemsDto) {
    const builder = this.items.createQueryBuilder('item');
    if (query.status)
      builder.andWhere('item.workflowStatus = :status', {
        status: query.status,
      });
    if (query.country)
      builder.andWhere('item.targetCountryCode = :country', {
        country: query.country.toUpperCase(),
      });
    if (query.search)
      builder.andWhere(
        '(LOWER(item.caption) LIKE :search OR LOWER(item.creatorUsername) LIKE :search OR LOWER(item.sourceQuery) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    const order =
      query.sort === 'views'
        ? 'item.playCount'
        : query.sort === 'likes'
          ? 'item.likeCount'
          : 'item.createdAt';
    const [items, total] = await builder
      .orderBy(order, 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: items.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async stats() {
    const total = await this.items.count();
    const statusRows = await this.items
      .createQueryBuilder('item')
      .select('item.workflowStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('item.workflowStatus')
      .getRawMany<{ status: string; count: string }>();
    const regionRows = await this.items
      .createQueryBuilder('item')
      .select('item.targetRegion', 'region')
      .addSelect('COUNT(*)', 'count')
      .groupBy('item.targetRegion')
      .getRawMany<{ region: string; count: string }>();
    const views = await this.items
      .createQueryBuilder('item')
      .select('COALESCE(SUM(item.playCount), 0)', 'total')
      .getRawOne<{ total: string }>();
    return {
      total,
      potentialViews: Number(views?.total ?? 0),
      byStatus: Object.fromEntries(
        statusRows.map((row) => [row.status, Number(row.count)]),
      ),
      byRegion: Object.fromEntries(
        regionRows.map((row) => [row.region, Number(row.count)]),
      ),
    };
  }

  async item(id: string) {
    const item = await this.items.findOneBy({ id });
    if (!item) throw new NotFoundException('Vídeo não encontrado');
    return item;
  }

  async update(id: string, input: UpdateItemDto) {
    const item = await this.item(id);
    if (input.workflowStatus) item.workflowStatus = input.workflowStatus;
    if (input.rightsConfirmed !== undefined)
      item.rightsConfirmed = input.rightsConfirmed;
    return this.serialize(await this.items.save(item));
  }

  async download(id: string) {
    const item = await this.item(id);
    if (item.localFilePath) {
      try {
        await stat(item.localFilePath);
        return this.serialize(item);
      } catch {
        item.localFilePath = null;
      }
    }
    if (!item.sourceVideoUrl)
      throw new BadRequestException('A HikerAPI não retornou a URL do vídeo');
    const source = new URL(item.sourceVideoUrl);
    const allowed = ['cdninstagram.com', 'fbcdn.net', 'instagram.com'].some(
      (domain) =>
        source.hostname === domain || source.hostname.endsWith(`.${domain}`),
    );
    if (source.protocol !== 'https:' || !allowed)
      throw new BadRequestException(
        'A origem do vídeo não é um CDN permitido do Instagram',
      );
    const directory = path.resolve(
      this.config.get<string>('MEDIA_STORAGE_PATH') || '.data/media',
    );
    await mkdir(directory, { recursive: true });
    const destination = path.join(directory, `${item.id}.mp4`);
    const response = await fetch(source, { redirect: 'follow' });
    if (!response.ok || !response.body)
      throw new BadRequestException(
        `Falha ao baixar vídeo (${response.status})`,
      );
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > 500 * 1024 * 1024 ? new Error('Vídeo excede 500 MB') : null,
          chunk,
        );
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(response.body as never),
        limiter,
        createWriteStream(destination, { flags: 'w' }),
      );
      item.localFilePath = destination;
      item.workflowStatus = 'downloaded';
      item.processingError = null;
      return this.serialize(await this.items.save(item));
    } catch (error) {
      item.workflowStatus = 'failed';
      item.processingError =
        error instanceof Error ? error.message : 'Falha no download';
      await this.items.save(item);
      throw error;
    }
  }

  async markPublishing(id: string) {
    const item = await this.item(id);
    item.rightsConfirmed = true;
    item.workflowStatus = 'publishing';
    item.processingError = null;
    return this.items.save(item);
  }
  async markPublished(id: string, videoId: string) {
    const item = await this.item(id);
    item.workflowStatus = 'published';
    item.youtubeVideoId = videoId;
    item.youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;
    item.processingError = null;
    return this.items.save(item);
  }
  async markFailed(id: string, error: unknown) {
    const item = await this.item(id);
    item.workflowStatus = 'failed';
    item.processingError =
      error instanceof Error ? error.message : 'Falha desconhecida';
    return this.items.save(item);
  }

  serialize(item: MediaItem) {
    return {
      ...item,
      localFilePath: undefined,
      processedFilePath: undefined,
      hasLocalFile: Boolean(item.localFilePath),
      hasProcessedFile: Boolean(item.processedFilePath),
      downloadUrl: item.localFilePath ? `/api/items/${item.id}/file` : null,
      previewUrl: item.processedFilePath
        ? `/api/items/${item.id}/preview`
        : null,
    };
  }

  private startExecution(id: string) {
    if (this.activeScans.has(id)) return;
    const execution = this.execute(id).finally(() => {
      if (this.activeScans.get(id) === execution) this.activeScans.delete(id);
    });
    this.activeScans.set(id, execution);
  }

  private async execute(id: string) {
    const scan = await this.scan(id);
    try {
      const queries = scan.countryCodes.flatMap((code) =>
        scan.keywords.map((keyword) => ({ code, keyword })),
      );
      for (
        let queryIndex = scan.processedQueries;
        queryIndex < queries.length;
        queryIndex += 1
      ) {
        const current = await this.scan(id);
        if (current.status !== 'running') return;
        const { code, keyword } = queries[queryIndex];
        const country = findCountry(code);
        if (!country) continue;
        const query = `${keyword} ${country.searchLabel}`;
        const result = await this.hiker.searchReels(query, scan.pagesPerQuery);
        scan.requestsUsed += result.requestsUsed;
        scan.resultsFound += result.items.length;
        for (const media of result.items) {
          const existing = await this.items.findOneBy({
            sourceMediaId: media.sourceMediaId,
          });
          if (existing) {
            existing.playCount = media.playCount;
            existing.likeCount = media.likeCount;
            existing.commentCount = media.commentCount;
            existing.sourceVideoUrl =
              media.sourceVideoUrl ?? existing.sourceVideoUrl;
            existing.thumbnailUrl = media.thumbnailUrl ?? existing.thumbnailUrl;
            await this.items.save(existing);
            continue;
          }
          await this.items.save(
            this.items.create({
              ...media,
              sourceNetwork: 'instagram',
              sourceQuery: query,
              targetCountryCode: country.code,
              targetCountryName: country.name,
              targetRegion: country.region,
              countryMatchBasis: 'search_query',
              workflowStatus: 'discovered',
              rightsConfirmed: false,
              localFilePath: null,
              processedFilePath: null,
              narrationScript: null,
              narrationVoice: null,
              captionsBurned: false,
              processedAt: null,
              youtubeVideoId: null,
              youtubeUrl: null,
              processingError: null,
              scanId: scan.id,
            }),
          );
          scan.newItems += 1;
        }
        scan.processedQueries = queryIndex + 1;
        await this.scans.update(
          { id },
          {
            requestsUsed: scan.requestsUsed,
            resultsFound: scan.resultsFound,
            newItems: scan.newItems,
            processedQueries: scan.processedQueries,
          },
        );
      }
      const latest = await this.scan(id);
      if (latest.status !== 'running') return;
      latest.status = 'completed';
      latest.completedAt = new Date();
      await this.scans.save(latest);
    } catch (error) {
      const latest = await this.scan(id);
      if (latest.status === 'paused') return;
      latest.status = 'failed';
      latest.error =
        error instanceof Error ? error.message : 'Falha desconhecida';
      latest.completedAt = new Date();
      await this.scans.save(latest);
    }
  }
}
