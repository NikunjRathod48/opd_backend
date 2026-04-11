import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegisterGroupAdminDto } from './dto/register-group-admin.dto';
import { RegisterHospitalAdminDto } from './dto/register-hospital-admin.dto';
import { AuthService } from './auth.service';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterReceptionistDto } from './dto/register-receptionist.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Roles('Super Admin')
  @Post('register-super-admin')
  async registerSuperAdmin(@Body() registerDto: RegisterSuperAdminDto) {
    return this.authService.registerSuperAdmin(registerDto);
  }

  @Roles('Super Admin')
  @Post('register-group-admin')
  @UseInterceptors(FileInterceptor('file'))
  async registerGroupAdmin(
    @Body() registerDto: RegisterGroupAdminDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.registerGroupAdmin(registerDto, file);
  }

  @Roles('Super Admin', 'Group Admin')
  @Post('register-hospital-admin')
  @UseInterceptors(FileInterceptor('file'))
  async registerHospitalAdmin(
    @Body() registerDto: RegisterHospitalAdminDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.registerHospitalAdmin(registerDto, file);
  }

  @Roles('Super Admin', 'Group Admin', 'Hospital Admin')
  @Post('register-receptionist')
  @UseInterceptors(FileInterceptor('file'))
  async registerReceptionist(
    @Body() registerDto: RegisterReceptionistDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.registerReceptionist(registerDto, file);
  }

  @Public()
  @Post('register')
  @UseInterceptors(FileInterceptor('file'))
  async registerPatient(
    @Body() registerDto: RegisterPatientDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.registerPatient(registerDto, file);
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}