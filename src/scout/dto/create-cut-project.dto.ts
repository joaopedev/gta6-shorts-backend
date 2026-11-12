import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateCutProjectDto {
  @IsString()
  @Length(2, 120)
  title: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  language = 'auto';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  clipCount = 3;

  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(90)
  minSeconds = 20;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(180)
  maxSeconds = 45;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  rightsConfirmed: boolean;
}
