import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
  IsOptional,
  IsInt,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterHospitalAdminDto {
  @IsNotEmpty()
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  hospital_id: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  hospital_group_id: number;

  @IsNotEmpty()
  @IsDateString()
  joining_date: string;
}
