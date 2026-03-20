import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class AddProcedureDto {
  @IsInt()
  procedure_id: number;

  @IsDateString()
  procedure_date: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}
