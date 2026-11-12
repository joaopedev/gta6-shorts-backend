import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class PublishItemDto {
  @IsString() @Length(1, 100) title: string;
  @IsOptional() @IsString() @Length(0, 5000) description = '';
  @IsOptional() @IsIn(['private', 'unlisted', 'public']) privacyStatus:
    'private' | 'unlisted' | 'public' = 'private';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags: string[] = [];
  @IsBoolean() rightsConfirmed: boolean;
}
