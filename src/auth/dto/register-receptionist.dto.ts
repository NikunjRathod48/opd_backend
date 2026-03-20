import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
  IsInt,
  IsDateString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterReceptionistDto {
  @IsNotEmpty()
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(12)
  @Matches(/^\S*$/, { message: 'Password must not contain spaces' })
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
