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
import { mkdir, stat, writeFile } from 'fs/promises';
import OpenAI from 'openai';
import path from 'path';
import { Repository } from 'typeorm';
import { EditVideoDto } from './dto/edit-video.dto';
import { NarrationVoice } from './dto/render-narration.dto';
import { MediaItem } from './entities/media-item.entity';

@Injectable()
export class MediaStudioService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(MediaItem)
    private readonly items: Repository<MediaItem>,
  ) {}

  status() {
    return {
      configured: Boolean(this.config.get<string>('OPENAI_API_KEY')),
      textModel: this.config.get<string>('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
      speechModel:
        this.config.get<string>('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts',
      defaultVoice: this.config.get<string>('OPENAI_TTS_VOICE') || 'coral',
    };
  }

  async generateScript(id: string, language: 'pt-BR' | 'en' | 'es') {
    const item = await this.item(id);
    const duration = Math.max(8, Math.min(item.durationSeconds ?? 35, 90));
    const wordLimit = Math.max(16, Math.floor(duration * 1.9));
    const languageName =
      language === 'pt-BR'
        ? 'português brasileiro'
        : language === 'es'
          ? 'espanhol'
          : 'inglês';
    const response = await this.client().responses.create({
      model: this.config.get<string>('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
      instructions:
        'Você escreve narrações curtas para vídeos verticais. Não invente fatos, vazamentos, datas ou afirmações que não estejam no contexto. Entregue somente o texto falado, sem título, aspas, hashtags ou marcações.',
      input: [
        `Escreva em ${languageName}.`,
        `O vídeo tem aproximadamente ${Math.round(duration)} segundos.`,
        `Use no máximo ${wordLimit} palavras e comece com um gancho curto.`,
        `Tema da busca: ${item.sourceQuery}.`,
        `Legenda original: ${(item.caption || 'sem legenda').slice(0, 1600)}.`,
      ].join('\n'),
    });
    const script = response.output_text.trim();
    if (!script)
      throw new ServiceUnavailableException(
        'A OpenAI não retornou um texto de narração',
      );
    item.narrationScript = script;
    await this.items.save(item);
    return { script, language, estimatedDurationSeconds: duration };
  }

  async render(
    id: string,
    input: { script: string; voice: NarrationVoice; captions: boolean },
  ) {
    return this.edit(id, {
      startSeconds: 0,
      endSeconds: Number.MAX_SAFE_INTEGER,
      format: 'original',
      fit: 'contain',
      audio: 'narration',
      script: input.script,
      voice: input.voice,
      captions: input.captions,
    });
  }

  async edit(id: string, input: EditVideoDto) {
    const item = await this.item(id);
    if (!item.localFilePath)
      throw new BadRequestException('Baixe o vídeo antes de abrir o editor');
    try {
      await stat(item.localFilePath);
    } catch {
      throw new NotFoundException('O arquivo original não foi encontrado');
    }
    if (!ffmpegPath)
      throw new ServiceUnavailableException(
        'O FFmpeg não está disponível nesta plataforma',
      );

    const directory = path.resolve(
      this.config.get<string>('PROCESSED_MEDIA_PATH') || '.data/processed',
      item.id,
    );
    await mkdir(directory, { recursive: true });
    const speechPath = path.join(directory, 'voice.mp3');
    const captionsPath = path.join(directory, 'captions.ass');
    const previewPath = path.join(directory, 'preview.mp4');
    const videoDuration = await this.duration(item.localFilePath);
    if (!videoDuration)
      throw new BadRequestException(
        'Não foi possível medir a duração da mídia',
      );
    const start = Math.min(
      Math.max(0, input.startSeconds),
      videoDuration - 0.5,
    );
    const end = Math.min(input.endSeconds, videoDuration);
    if (end <= start + 0.49)
      throw new BadRequestException(
        'O final do corte deve ser maior que o início',
      );
    const clipDuration = end - start;
    const script = input.script?.trim() ?? '';
    if (input.audio === 'narration' && !script)
      throw new BadRequestException('Informe ou gere o texto da narração');
    if (input.captions && input.audio !== 'narration')
      throw new BadRequestException(
        'As legendas automáticas exigem uma narração nesta versão',
      );

    const args = ['-y', '-ss', start.toFixed(3), '-i', item.localFilePath];
    let audioArgs: string[];
    if (input.audio === 'narration') {
      const speech = await this.client().audio.speech.create({
        model: this.config.get<string>('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts',
        voice: input.voice,
        input: script,
        instructions:
          'Fale em português brasileiro com clareza, energia moderada e ritmo natural de vídeo curto. Não cante e não acrescente palavras.',
        response_format: 'mp3',
      });
      await writeFile(speechPath, Buffer.from(await speech.arrayBuffer()));
      const speechDuration = await this.duration(speechPath);
      if (!speechDuration)
        throw new BadRequestException('Não foi possível medir a narração');
      const tempo =
        speechDuration > clipDuration ? speechDuration / clipDuration : 1;
      const spokenDuration = Math.min(clipDuration, speechDuration / tempo);
      await writeFile(captionsPath, this.ass(script, spokenDuration), 'utf8');
      const audioFilters = [...this.tempoFilters(tempo), 'apad'].join(',');
      args.push('-i', speechPath);
      audioArgs = [
        '-filter_complex',
        `[1:a]${audioFilters}[narration]`,
        '-map',
        '[narration]',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ];
    } else if (input.audio === 'mute') {
      audioArgs = ['-an'];
    } else {
      audioArgs = ['-map', '0:a?', '-c:a', 'aac', '-b:a', '192k'];
    }
    args.push('-t', clipDuration.toFixed(3), '-map', '0:v:0', ...audioArgs);

    const videoFilters: string[] = [];
    if (input.format === 'vertical') {
      videoFilters.push(
        input.fit === 'cover'
          ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
          : 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
      );
    }
    if (input.captions) videoFilters.push('ass=captions.ass');
    if (videoFilters.length) args.push('-vf', videoFilters.join(','));
    args.push(
      '-map_metadata',
      '0',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      previewPath,
    );
    await this.run(ffmpegPath, args, directory);

    item.processedFilePath = previewPath;
    item.narrationScript = input.audio === 'narration' ? script : null;
    item.narrationVoice = input.audio === 'narration' ? input.voice : null;
    item.captionsBurned = input.captions;
    item.processedKind = input.audio === 'narration' ? 'narrated' : 'edited';
    item.editStartSeconds = start;
    item.editEndSeconds = end;
    item.audioMode = input.audio;
    item.outputFormat = input.format;
    item.processedAt = new Date();
    item.processingError = null;
    await this.items.save(item);
    return item;
  }

  private client() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Configure OPENAI_API_KEY no .env do backend',
      );
    return new OpenAI({ apiKey });
  }

  private async item(id: string) {
    const item = await this.items.findOneBy({ id });
    if (!item) throw new NotFoundException('Vídeo não encontrado');
    return item;
  }

  private async duration(file: string) {
    const output = await this.run(
      ffprobeStatic.path,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      path.dirname(file),
    );
    return Number.parseFloat(output.trim());
  }

  private tempoFilters(value: number) {
    const filters: string[] = [];
    let remaining = Math.max(1, value);
    while (remaining > 2) {
      filters.push('atempo=2');
      remaining /= 2;
    }
    if (remaining > 1.001) filters.push(`atempo=${remaining.toFixed(5)}`);
    return filters;
  }

  private ass(script: string, duration: number) {
    const words = script
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ');
    const groups: string[][] = [];
    for (let index = 0; index < words.length; index += 5)
      groups.push(words.slice(index, index + 5));
    const unit = duration / Math.max(words.length, 1);
    let cursor = 0;
    const events = groups.map((group) => {
      const start = cursor;
      cursor += group.length * unit;
      return `Dialogue: 0,${this.assTime(start)},${this.assTime(Math.min(cursor, duration))},Default,,0,0,0,,${group.join(' ')}`;
    });
    return [
      '[Script Info]',
      'ScriptType: v4.00+',
      'PlayResX: 1080',
      'PlayResY: 1920',
      'WrapStyle: 2',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,68,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,5,1,2,70,70,210,1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
      '',
    ].join('\n');
  }

  private assTime(seconds: number) {
    const safe = Math.max(0, seconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remaining = safe % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remaining.toFixed(2).padStart(5, '0')}`;
  }

  private run(command: string, args: string[], cwd: string) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
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
