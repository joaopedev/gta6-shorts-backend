import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateScanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Length(2, 60, { each: true })
  keywords: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  countryCodes: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  pagesPerQuery = 1;
}
