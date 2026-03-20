import {
  Body,
  Controller,
  Patch,
  Get,
  UploadedFile,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Self-service: any authenticated user can update their own profile
  @Patch('profile')
  @UseInterceptors(FileInterceptor('file'))
  async updateProfile(
    @Request() req,
    @Body() updateDto: UpdateProfileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = req.user.userId;
    return this.usersService.updateProfile(userId, updateDto, file);
  }

  // Self-service: any authenticated user can change their own password
  @Patch('change-password')
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const userId = req.user.userId;
    return this.usersService.changePassword(userId, changePasswordDto);
  }

  // Admin-only: list all users
  @Get()
  @Roles('Super Admin')
  async findAllUsers() {
    return this.usersService.getAllUsers();
  }
}
