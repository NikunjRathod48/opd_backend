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
  async registerPatient(@Body() registerDto: RegisterPatientDto) {
    return this.authService.registerPatient(registerDto);
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}