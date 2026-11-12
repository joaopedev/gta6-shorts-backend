import { IsIn, IsOptional } from 'class-validator';

export class GenerateScriptDto {
  @IsOptional()
  @IsIn(['pt-BR', 'en', 'es'])
  language: 'pt-BR' | 'en' | 'es' = 'pt-BR';
}
