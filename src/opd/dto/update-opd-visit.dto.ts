import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateOpdVisitDto {
  @IsString()
  @IsOptional()
  clinical_notes?: string;

  @IsString()
  @IsOptional()
  chief_complaint?: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean; // Set false to discharge/close
}
