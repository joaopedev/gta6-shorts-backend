import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { NARRATION_VOICES } from './render-narration.dto';
import type { NarrationVoice } from './render-narration.dto';

export const VIDEO_FORMATS = ['original', 'vertical'] as const;
export const VIDEO_FITS = ['contain', 'cover'] as const;
export const VIDEO_AUDIO_MODES = ['original', 'mute', 'narration'] as const;

export class EditVideoDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(7200)
  startSeconds = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(7200)
  endSeconds: number;

  @IsOptional()
  @IsIn(VIDEO_FORMATS)
  format: (typeof VIDEO_FORMATS)[number] = 'vertical';

  @IsOptional()
  @IsIn(VIDEO_FITS)
  fit: (typeof VIDEO_FITS)[number] = 'contain';

  @IsOptional()
  @IsIn(VIDEO_AUDIO_MODES)
  audio: (typeof VIDEO_AUDIO_MODES)[number] = 'original';

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  script?: string;

  @IsOptional()
  @IsIn(NARRATION_VOICES)
  voice: NarrationVoice = 'coral';

  @IsOptional()
  @IsBoolean()
  captions = false;
}
