import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DailyScheduleDto {
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  day_of_week: number;

  @IsNotEmpty()
  @IsString()
  start_time: string;

  @IsNotEmpty()
  @IsString()
  end_time: string;

  @IsNotEmpty()
  @IsInt()
  @Min(0)
  max_appointments: number;

  @IsNotEmpty()
  @IsBoolean()
  is_available: boolean;
}

export class UpdateAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyScheduleDto)
  schedule: DailyScheduleDto[];
}
