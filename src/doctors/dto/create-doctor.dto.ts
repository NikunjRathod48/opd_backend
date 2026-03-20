import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDoctorDto {
  // --- User Details ---
  @IsNotEmpty()
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsNotEmpty()
  @MinLength(6)
  @Matches(/^\S*$/, { message: 'Password must not contain spaces' })
  password: string;

  // --- Doctor Professional Details ---
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  hospital_id: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  department_id: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  specialization_id: number;

  @IsNotEmpty()
  @IsString()
  gender: 'Male' | 'Female' | 'Other';

  @IsNotEmpty()
  @IsString()
  qualification: string;

  @IsNotEmpty()
  @IsString()
  medical_license_no: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  experience_years?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consultation_fees?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_available?: boolean;
}
