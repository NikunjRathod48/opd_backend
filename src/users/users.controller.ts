import {
  Body,
  Controller,
  Patch,
  Get,
  UploadedFile,
  UseInterceptors,
  Request,
  Param,
  ParseIntPipe,
  Put,
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

  // Get entire user profile with role relations (Admin)
  @Get(':id')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Receptionist', 'Doctor')
  async getUserById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserById(id);
  }

  // Update generalized user profile (Admin)
  @Put(':id')
  @UseInterceptors(FileInterceptor('file'))
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Receptionist')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.usersService.updateUser(id, updateData, file);
  }

  // Toggle user status (Admin)
  @Patch(':id/status')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin')
  async toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('is_active') is_active: boolean,
  ) {
    return this.usersService.toggleStatus(id, is_active);
  }
}
