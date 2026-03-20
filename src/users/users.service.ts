import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { EncryptionService } from '../auth/encryption.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private encryptionService: EncryptionService, // Start using encryption service directly
  ) {}

  async updateProfile(
    userId: number,
    updateDto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    const { full_name } = updateDto;

    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let profileImageUrl = user.profile_image_url;

    if (file) {
      try {
        profileImageUrl = await this.cloudinaryService.uploadImage(file);
      } catch (error) {
        console.error('Image upload failed', error);
        throw new InternalServerErrorException(
          'Failed to upload profile image',
        );
      }
    }

    // Only update provided fields
    const updatedUser = await this.prisma.users.update({
      where: { user_id: userId },
      data: {
        full_name: full_name || undefined,
        profile_image_url: profileImageUrl,
        modified_at: new Date(),
      },
    });

    // Return user without password
    const { password_hash, ...result } = updatedUser;
    return result;
  }

  async changePassword(userId: number, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmNewPassword } =
      changePasswordDto;

    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await this.encryptionService.comparePassword(
      currentPassword,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    await this.prisma.users.update({
      where: { user_id: userId },
      data: {
        password_changed_at: new Date(),
        modified_at: new Date(),
      },
    });

    const newPasswordHash =
      await this.encryptionService.hashPassword(newPassword);

    await this.prisma.users.update({
      where: { user_id: userId },
      data: {
        password_hash: newPasswordHash,
        password_changed_at: new Date(),
        modified_at: new Date(),
      },
    });

    return { message: 'Password changed successfully' };
  }

  async getAllUsers() {
    const users = await this.prisma.users.findMany({
      include: {
        roles: true,
        employees_employees_user_idTousers: {
          include: {
            hospital_groups: true,
            hospitals: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Map data to match what the frontend might need (e.g. including hospital/group info)
    return users.map((u) => ({
      user_id: u.user_id,
      username: u.email, // using email as a username stand-in
      full_name: u.full_name,
      email: u.email,
      phone_number: u.phone_number,
      role_name: u.roles?.role_name,
      hospital_name:
        u.employees_employees_user_idTousers?.hospitals?.hospital_name,
      hospital_group_name:
        u.employees_employees_user_idTousers?.hospital_groups?.group_name,
      is_active: u.is_active,
      profile_image_url: u.profile_image_url,
      created_at: u.created_at,
    }));
  }
}
