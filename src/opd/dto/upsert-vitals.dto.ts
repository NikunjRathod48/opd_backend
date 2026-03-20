import { IsOptional, IsNumber, IsString } from 'class-validator';

export class UpsertVitalsDto {
  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  blood_pressure?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  spo2?: number;

  @IsOptional()
  @IsNumber()
  pulse?: number;
}
