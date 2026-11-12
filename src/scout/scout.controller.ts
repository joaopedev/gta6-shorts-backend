import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import path from 'path';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreateCutProjectDto } from './dto/create-cut-project.dto';
import { EditVideoDto } from './dto/edit-video.dto';
import { GenerateScriptDto } from './dto/generate-script.dto';
import { ListItemsDto } from './dto/list-items.dto';
import { PublishItemDto } from './dto/publish-item.dto';
import { RenderNarrationDto } from './dto/render-narration.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { MediaStudioService } from './media-studio.service';
import { ScoutService } from './scout.service';
import { YoutubeService } from './youtube.service';
import { YoutubeCutsService } from './youtube-cuts.service';

const cutsUploadDirectory = path.resolve(
  process.env.CUTS_STORAGE_PATH || '.data/cuts',
  'uploads',
);
mkdirSync(cutsUploadDirectory, { recursive: true });

@Controller()
export class ScoutController {
  constructor(
    private readonly scout: ScoutService,
    private readonly youtube: YoutubeService,
    private readonly studio: MediaStudioService,
    private readonly cuts: YoutubeCutsService,
    private readonly config: ConfigService,
  ) {}

  @Get('countries') countries() {
    return this.scout.countries();
  }
  @Get('stats') stats() {
    return this.scout.stats();
  }
  @Post('scans') createScan(@Body() input: CreateScanDto) {
    return this.scout.createScan(input);
  }
  @Get('scans') scans() {
    return this.scout.listScans();
  }
  @Get('scans/:id') scan(@Param('id') id: string) {
    return this.scout.scan(id);
  }
  @Patch('scans/:id/pause') pauseScan(@Param('id') id: string) {
    return this.scout.pauseScan(id);
  }
  @Patch('scans/:id/resume') resumeScan(@Param('id') id: string) {
    return this.scout.resumeScan(id);
  }
  @Get('items') items(@Query() query: ListItemsDto) {
    return this.scout.listItems(query);
  }
  @Patch('items/:id') update(
    @Param('id') id: string,
    @Body() input: UpdateItemDto,
  ) {
    return this.scout.update(id, input);
  }
  @Post('items/:id/download') download(@Param('id') id: string) {
    return this.scout.download(id);
  }

  @Get('items/:id/file')
  async file(@Param('id') id: string, @Res() response: Response) {
    const item = await this.scout.item(id);
    if (!item.localFilePath)
      return response
        .status(404)
        .json({ message: 'Arquivo ainda não foi baixado' });
    await new Promise<void>((resolve, reject) => {
      response.sendFile(
        path.basename(item.localFilePath as string),
        { root: path.dirname(item.localFilePath as string) },
        (error) => {
          if (
            !error ||
            error.message === 'Request aborted' ||
            error.message.includes('ECANCELED')
          )
            resolve();
          else reject(error);
        },
      );
    });
  }

  @Get('studio/status') studioStatus() {
    return this.studio.status();
  }

  @Post('youtube-cuts')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: cutsUploadDirectory,
        filename: (_request, file, callback) => {
          const extension = path.extname(file.originalname).toLowerCase();
          callback(null, `${randomUUID()}${extension || '.mp4'}`);
        },
      }),
      limits: { files: 1, fileSize: 1024 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const allowed = [
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'video/x-matroska',
        ];
        callback(
          allowed.includes(file.mimetype)
            ? null
            : new BadRequestException('Envie um arquivo de vídeo válido'),
          allowed.includes(file.mimetype),
        );
      },
    }),
  )
  createCutProject(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: CreateCutProjectDto,
  ) {
    if (!file) throw new BadRequestException('Selecione o vídeo de origem');
    return this.cuts.create(file, input);
  }

  @Get('youtube-cuts') cutProjects() {
    return this.cuts.list();
  }

  @Get('youtube-cuts/:id') cutProject(@Param('id') id: string) {
    return this.cuts.project(id);
  }

  @Post('items/:id/narration-script')
  generateNarrationScript(
    @Param('id') id: string,
    @Body() input: GenerateScriptDto,
  ) {
    return this.studio.generateScript(id, input.language);
  }

  @Post('items/:id/render')
  async renderNarration(
    @Param('id') id: string,
    @Body() input: RenderNarrationDto,
  ) {
    await this.scout.download(id);
    const item = await this.studio.render(id, input);
    return this.scout.serialize(item);
  }

  @Post('items/:id/edit')
  async editVideo(@Param('id') id: string, @Body() input: EditVideoDto) {
    await this.scout.download(id);
    const item = await this.studio.edit(id, input);
    return this.scout.serialize(item);
  }

  @Get('items/:id/preview')
  async preview(@Param('id') id: string, @Res() response: Response) {
    const item = await this.scout.item(id);
    if (!item.processedFilePath)
      return response
        .status(404)
        .json({ message: 'A prévia narrada ainda não foi criada' });
    await new Promise<void>((resolve, reject) => {
      response.sendFile(
        path.basename(item.processedFilePath as string),
        { root: path.dirname(item.processedFilePath as string) },
        (error) => {
          if (
            !error ||
            error.message === 'Request aborted' ||
            error.message.includes('ECANCELED')
          )
            resolve();
          else reject(error);
        },
      );
    });
  }

  @Post('items/:id/publish')
  async publish(@Param('id') id: string, @Body() input: PublishItemDto) {
    if (!input.rightsConfirmed)
      throw new BadRequestException('Confirme os direitos de publicação');
    await this.scout.download(id);
    const item = await this.scout.markPublishing(id);
    void this.youtube
      .publish(item, input)
      .then((videoId) => this.scout.markPublished(id, videoId))
      .catch((error) => this.scout.markFailed(id, error));
    return this.scout.serialize(item);
  }

  @Get('youtube/status') youtubeStatus() {
    return this.youtube.status();
  }
  @Get('youtube/auth-url') youtubeAuthUrl() {
    return this.youtube.authUrl();
  }
  @Get('youtube/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ) {
    await this.youtube.callback(code, state);
    response.redirect(
      `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/?youtube=connected`,
    );
  }
  @Delete('youtube/connection') disconnect() {
    return this.youtube.disconnect();
  }
}
