import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateHospitalAdminDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  full_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone_number?: string;

  @IsOptional()
  @IsString()
  joining_date?: string;
}
