import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOpdTestItemDto {
  @IsInt()
  @IsNotEmpty()
  test_id: number;

  @IsString()
  @IsOptional()
  test_status?: string;

  @IsString()
  @IsOptional()
  result_summary?: string;
}

export class CreateOpdTestDto {
  @IsInt()
  @IsNotEmpty()
  visit_id: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOpdTestItemDto)
  tests: CreateOpdTestItemDto[];
}
