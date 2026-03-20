import { IsInt, IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateFollowupDto {
  @IsInt()
  visit_id: number;

  @IsDateString()
  recommended_date: string;

  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  status?: string; // defaults to 'Scheduled'
}

export class UpdateFollowupDto {
  @IsString()
  @IsOptional()
  status?: string; // 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled'

  @IsDateString()
  @IsOptional()
  recommended_date?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
