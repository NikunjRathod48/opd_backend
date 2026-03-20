import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class PrescriptionItemDto {
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  medicine_id: number;

  @IsString()
  dosage: string;

  @IsInt()
  @Transform(({ value }) => parseInt(value))
  quantity: number;

  @IsInt()
  @Transform(({ value }) => parseInt(value))
  duration_days: number;

  @IsString()
  @IsOptional()
  instructions?: string;
}

export class AddPrescriptionDto {
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  doctor_id: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
