import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class AddDiagnosisDto {
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  diagnosis_id: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  is_primary?: boolean;

  @IsString()
  @IsOptional()
  remarks?: string;
}
