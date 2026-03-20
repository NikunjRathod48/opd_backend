import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOpdProcedureItemDto {
  @IsInt()
  @IsNotEmpty()
  procedure_id: number;

  @IsString()
  @IsNotEmpty()
  procedure_date: string; // ISO date string

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class CreateOpdProcedureDto {
  @IsInt()
  @IsNotEmpty()
  visit_id: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOpdProcedureItemDto)
  procedures: CreateOpdProcedureItemDto[];
}
