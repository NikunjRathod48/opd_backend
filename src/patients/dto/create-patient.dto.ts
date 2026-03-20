import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsDateString,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePatientDto {
  @IsOptional()
  @IsString()
  patient_no?: string;

  @IsNotEmpty()
  @IsString()
  full_name: string; // Maps to users.full_name

  @IsNotEmpty()
  @IsDateString()
  dob: string;

  @IsNotEmpty()
  @IsString()
  gender: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  blood_group_id?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  city_id?: number;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  state_id?: number;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  emergency_contact_name?: string;

  @IsOptional()
  @IsString()
  emergency_contact_number?: string;

  @IsOptional()
  @IsBoolean()
  is_walk_in?: boolean;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  hospital_group_id?: number;
}
