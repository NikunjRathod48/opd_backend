import {
  IsInt,
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsInt()
  hospital_id: number;

  @IsInt()
  patient_id: number;

  @IsInt()
  doctor_id: number;

  @IsDateString()
  appointment_date: string; // YYYY-MM-DD

  @IsString()
  appointment_time: string; // HH:mm:ss

  @IsString()
  @IsOptional()
  remarks?: string;
}
