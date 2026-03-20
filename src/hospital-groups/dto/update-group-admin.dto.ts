import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
  IsInt,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateGroupAdminDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone_number?: string;

  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  hospital_group_id?: number;

  @IsOptional()
  @IsDateString()
  joining_date?: string;
}
