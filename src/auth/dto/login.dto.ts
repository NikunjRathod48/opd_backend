import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // Can be email or phone number

  @IsString()
  @IsNotEmpty()
  password: string;
}
