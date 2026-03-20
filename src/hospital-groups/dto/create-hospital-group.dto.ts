import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHospitalGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  group_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  group_code: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  registration_no?: string;

  @IsString()
  @IsOptional()
  @MaxLength(15)
  contact_phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  contact_email?: string;
}
