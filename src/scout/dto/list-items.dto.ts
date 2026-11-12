import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListItemsDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['recent', 'views', 'likes']) sort:
    'recent' | 'views' | 'likes' = 'recent';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 24;
}
