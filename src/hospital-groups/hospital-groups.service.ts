import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHospitalGroupDto } from './dto/create-hospital-group.dto';
import { UpdateHospitalGroupDto } from './dto/update-hospital-group.dto';
import { UpdateGroupAdminDto } from './dto/update-group-admin.dto';
import { EncryptionService } from '../auth/encryption.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class HospitalGroupsService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(createDto: CreateHospitalGroupDto, userId: number) {
    try {
      // Check for uniqueness
      const existing = await this.prisma.hospital_groups.findFirst({
        where: {
          OR: [
            { group_name: createDto.group_name },
            { group_code: createDto.group_code },
            ...(createDto.registration_no
              ? [{ registration_no: createDto.registration_no }]
              : []),
          ],
        },
      });

      if (existing) {
        throw new ConflictException(
          'A hospital group with this Name, Code, or Registration Number already exists.',
        );
      }

      return await this.prisma.hospital_groups.create({
        data: {
          ...createDto,
          created_by: userId,
          modified_by: userId,
          is_active: true,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      console.error('Error creating hospital group:', error);
      throw new InternalServerErrorException('Failed to create hospital group');
    }
  }

  async findAll() {
    return this.prisma.hospital_groups.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        users_hospital_groups_created_byTousers: {
          select: { full_name: true },
        },
        employees: {
          where: { employee_type: 'GROUP ADMIN' },
          include: {
            users_employees_user_idTousers: {
              select: {
                user_id: true,
                full_name: true,
                email: true,
                phone_number: true,
                profile_image_url: true,
                is_active: true,
              },
            },
          },
        },
      },
    });
  }

  async update(id: number, updateDto: UpdateHospitalGroupDto, userId: number) {
    try {
      // Check if exists
      const existing = await this.prisma.hospital_groups.findUnique({
        where: { hospital_group_id: id },
      });

      if (!existing) {
        throw new NotFoundException(`Hospital Group with ID ${id} not found`);
      }

      // Check for uniqueness if modifying unique fields
      if (
        updateDto.group_name ||
        updateDto.group_code ||
        updateDto.registration_no
      ) {
        const duplicate = await this.prisma.hospital_groups.findFirst({
          where: {
            AND: [
              { hospital_group_id: { not: id } }, // Exclude current record
              {
                OR: [
                  ...(updateDto.group_name
                    ? [{ group_name: updateDto.group_name }]
                    : []),
                  ...(updateDto.group_code
                    ? [{ group_code: updateDto.group_code }]
                    : []),
                  ...(updateDto.registration_no
                    ? [{ registration_no: updateDto.registration_no }]
                    : []),
                ],
              },
            ],
          },
        });

        if (duplicate) {
          throw new ConflictException(
            'A hospital group with this Name, Code, or Registration Number already exists.',
          );
        }
      }

      return await this.prisma.hospital_groups.update({
        where: { hospital_group_id: id },
        data: {
          ...updateDto,
          modified_by: userId,
          modified_at: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        throw error;
      console.error('Error updating hospital group:', error);
      throw new InternalServerErrorException('Failed to update hospital group');
    }
  }

  async findAllGroupAdmins() {
    return this.prisma.employees.findMany({
      where: { employee_type: 'GROUP ADMIN' },
      include: {
        users_employees_user_idTousers: {
          select: {
            user_id: true,
            full_name: true,
            email: true,
            phone_number: true,
            is_active: true,
            profile_image_url: true,
            last_login_at: true,
          },
        },
        hospital_groups: {
          select: {
            hospital_group_id: true,
            group_name: true,
          },
        },
      },
      orderBy: { joining_date: 'desc' },
    });
  }

  async toggleAdminStatus(
    adminId: number,
    isActive: boolean,
    modifierId: number,
  ) {
    try {
      // Update User status
      const updatedUser = await this.prisma.users.update({
        where: { user_id: adminId },
        data: {
          is_active: isActive,
          modified_at: new Date(),
        },
      });

      // Sync employee status
      await this.prisma.employees.updateMany({
        where: { user_id: adminId },
        data: {
          is_active: isActive,
          modified_by: modifierId,
          modified_at: new Date(),
        },
      });

      return updatedUser;
    } catch (error) {
      console.error('Error toggling admin status:', error);
      throw new InternalServerErrorException('Failed to update admin status');
    }
  }

  async updateGroupAdmin(
    adminId: number,
    updateDto: UpdateGroupAdminDto,
    modifierId: number,
    file?: Express.Multer.File,
  ) {
    const {
      full_name,
      email,
      phone_number,
      password,
      hospital_group_id,
      joining_date,
    } = updateDto;

    try {
      const user = await this.prisma.users.findUnique({
        where: { user_id: adminId },
      });
      if (!user) throw new NotFoundException('Admin not found');

      let passwordHash: string | undefined;
      if (password) {
        passwordHash = await this.encryptionService.hashPassword(password);
      }

      let profileImageUrl: string | undefined;
      if (file) {
        profileImageUrl = await this.cloudinaryService.uploadImage(file);
      }

      // Check for existing email/phone if changed
      if (email || phone_number) {
        const existing = await this.prisma.users.findFirst({
          where: {
            AND: [
              { user_id: { not: adminId } },
              {
                OR: [
                  ...(email ? [{ email }] : []),
                  ...(phone_number ? [{ phone_number }] : []),
                ],
              },
            ],
          },
        });

        if (existing) {
          throw new ConflictException(
            'User with this Email or Phone already exists.',
          );
        }
      }

      // Use transaction for consistency
      return await this.prisma.$transaction(async (tx) => {
        // 1. Update User
        const updatedUser = await tx.users.update({
          where: { user_id: adminId },
          data: {
            ...(full_name ? { full_name } : {}),
            ...(email ? { email } : {}),
            ...(phone_number ? { phone_number } : {}),
            ...(passwordHash
              ? { password_hash: passwordHash, password_changed_at: new Date() }
              : {}),
            ...(profileImageUrl ? { profile_image_url: profileImageUrl } : {}),
            modified_at: new Date(),
          },
        });

        // 2. Update Employee
        if (hospital_group_id || joining_date) {
          await tx.employees.updateMany({
            where: { user_id: adminId },
            data: {
              ...(hospital_group_id
                ? { hospital_group_id: Number(hospital_group_id) }
                : {}),
              ...(joining_date ? { joining_date: new Date(joining_date) } : {}),
              modified_by: modifierId,
              modified_at: new Date(),
            },
          });
        }

        const { password_hash, ...result } = updatedUser;
        return result;
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        throw error;
      console.error('Error updating group admin:', error);
      throw new InternalServerErrorException('Failed to update group admin');
    }
  }
}
