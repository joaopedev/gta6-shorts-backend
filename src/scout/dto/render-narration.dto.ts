import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export const NARRATION_VOICES = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;

export type NarrationVoice = (typeof NARRATION_VOICES)[number];

export class RenderNarrationDto {
  @IsString()
  @Length(1, 2000)
  script: string;

  @IsOptional()
  @IsIn(NARRATION_VOICES)
  voice: NarrationVoice = 'coral';

  @IsOptional()
  @IsBoolean()
  captions = true;
}
