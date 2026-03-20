import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateHospitalDto {
  @IsNumber()
  @IsNotEmpty()
  hospital_group_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  hospital_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  hospital_code: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  registration_validity_months: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  receptionist_contact: string;

  @IsDateString()
  @IsNotEmpty()
  opening_date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsNumber()
  @IsOptional()
  city_id?: number;

  @IsNumber()
  @IsOptional()
  state_id?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  pincode: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  registration_no?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  license_no?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  gst_no?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  contact_phone?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(150)
  contact_email?: string;

  @IsString()
  @IsOptional()
  opening_time?: string;

  @IsString()
  @IsOptional()
  closing_time?: string;

  @IsBoolean()
  @IsOptional()
  is_24by7?: boolean;
}
