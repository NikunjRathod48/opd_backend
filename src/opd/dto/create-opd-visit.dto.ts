import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateOpdVisitDto {
  @IsInt()
  hospital_id: number;

  @IsInt()
  patient_id: number;

  @IsInt()
  @IsOptional()
  doctor_id?: number; // Optional if created from Appointment where doctor is known or assigned later

  @IsInt()
  @IsOptional()
  appointment_id?: number;

  @IsString()
  @IsOptional()
  chief_complaint?: string;

  @IsOptional()
  is_follow_up?: boolean;

  @IsInt()
  @IsOptional()
  old_opd_id?: number;
}
