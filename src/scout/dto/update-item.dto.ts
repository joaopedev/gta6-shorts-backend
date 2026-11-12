import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateItemDto {
  @IsOptional()
  @IsIn(['discovered', 'approved', 'downloaded', 'rejected'])
  workflowStatus?: 'discovered' | 'approved' | 'downloaded' | 'rejected';

  @IsOptional()
  @IsBoolean()
  rightsConfirmed?: boolean;
}
