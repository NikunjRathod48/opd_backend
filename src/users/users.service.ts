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
          include: { hospital_groups: true, hospitals: true },
        },
        doctors_doctors_user_idTousers: {
          include: { hospitals: { include: { hospital_groups: true } } },
        },
        patients_patients_user_idTousers: {
          include: { hospital_groups: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return users.map((u) => {
      let hName = u.employees_employees_user_idTousers?.hospitals?.hospital_name;
      let hgName = u.employees_employees_user_idTousers?.hospital_groups?.group_name;

      if (u.roles?.role_name === 'Doctor' && u.doctors_doctors_user_idTousers) {
        hName = u.doctors_doctors_user_idTousers.hospitals?.hospital_name;
        hgName = u.doctors_doctors_user_idTousers.hospitals?.hospital_groups?.group_name;
      } else if (u.roles?.role_name === 'Patient' && u.patients_patients_user_idTousers.length > 0) {
        hgName = u.patients_patients_user_idTousers[0].hospital_groups?.group_name;
      }

      return {
        user_id: u.user_id,
        username: u.email,
        full_name: u.full_name,
        email: u.email,
        phone_number: u.phone_number,
        role_name: u.roles?.role_name,
        hospital_name: hName,
        hospital_group_name: hgName,
        is_active: u.is_active,
        profile_image_url: u.profile_image_url,
        created_at: u.created_at,
      };
    });
  }

  async getUserById(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      include: {
        roles: true,
        employees_employees_user_idTousers: {
          include: { hospital_groups: true, hospitals: true },
        },
        doctors_doctors_user_idTousers: {
          include: { hospitals: { include: { hospital_groups: true } }, departments_master: true, specializations: true },
        },
        patients_patients_user_idTousers: {
          include: { hospital_groups: true, blood_groups: true, cities: true, states: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const role = user.roles?.role_name || '';
    const result: any = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      phone_number: user.phone_number,
      username: user.email,
      role_name: role,
      is_active: user.is_active,
      profile_image_url: user.profile_image_url,
      created_at: user.created_at,
    };

    if (role === 'Doctor' && user.doctors_doctors_user_idTousers) {
      const doc = user.doctors_doctors_user_idTousers;
      result.hospital_id = doc.hospital_id ? String(doc.hospital_id) : '';
      result.hospital_group_id = doc.hospitals?.hospital_group_id ? String(doc.hospitals.hospital_group_id) : '';
      result.hospital_name = doc.hospitals?.hospital_name;
      result.hospital_group_name = doc.hospitals?.hospital_groups?.group_name;
      result.department_id = doc.department_id ? String(doc.department_id) : '';
      result.specialization_id = doc.specialization_id ? String(doc.specialization_id) : '';
      result.gender = doc.gender;
      result.qualification = doc.qualification;
      result.medical_license_no = doc.medical_license_no;
      result.experience_years = doc.experience_years;
      result.consultation_fees = doc.consultation_fees;
    } else if (role === 'Patient' && user.patients_patients_user_idTousers.length > 0) {
      const pat = user.patients_patients_user_idTousers[0];
      result.hospital_group_id = pat.hospital_group_id ? String(pat.hospital_group_id) : '';
      result.hospital_group_name = pat.hospital_groups?.group_name;
      result.gender = pat.gender;
      if (pat.dob) {
        const d = new Date(pat.dob);
        result.dob = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      result.blood_group_id = pat.blood_group_id ? String(pat.blood_group_id) : '';
      result.address = pat.address;
      result.emergency_contact_name = pat.emergency_contact_name;
      result.emergency_contact_number = pat.emergency_contact_number;
      result.pincode = pat.pincode;
      result.patient_no = pat.patient_no;
    } else if (user.employees_employees_user_idTousers) {
      const emp = user.employees_employees_user_idTousers;
      result.hospital_id = emp.hospital_id ? String(emp.hospital_id) : '';
      result.hospital_group_id = emp.hospital_group_id ? String(emp.hospital_group_id) : '';
      result.hospital_name = emp.hospitals?.hospital_name;
      result.hospital_group_name = emp.hospital_groups?.group_name;
    }

    return result;
  }

  async updateUser(userId: number, updateDto: any, file?: Express.Multer.File) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      include: {
        roles: true,
        employees_employees_user_idTousers: true,
        doctors_doctors_user_idTousers: true,
        patients_patients_user_idTousers: true,
      }
    });

    if (!user) throw new NotFoundException('User not found');

    let profileImageUrl = user.profile_image_url;
    if (file) {
      try {
        profileImageUrl = await this.cloudinaryService.uploadImage(file);
      } catch (error) {
        throw new InternalServerErrorException('Failed to upload profile image');
      }
    }

    const role = user.roles?.role_name || '';

    return this.prisma.$transaction(async (tx) => {
      // 1. Update general user data
      const updateData: any = { modified_at: new Date() };
      if (updateDto.full_name) updateData.full_name = updateDto.full_name;
      if (updateDto.email) updateData.email = updateDto.email;
      if (updateDto.phone_number) updateData.phone_number = updateDto.phone_number;
      if (profileImageUrl) updateData.profile_image_url = profileImageUrl;
      
      if (updateDto.password) {
        updateData.password_hash = await this.encryptionService.hashPassword(updateDto.password);
        updateData.password_changed_at = new Date();
      }

      const updatedUser = await tx.users.update({
        where: { user_id: userId },
        data: updateData
      });

      // 2. Update specific role tables
      if (role === 'Doctor' && user.doctors_doctors_user_idTousers) {
        await tx.doctors.update({
          where: { doctor_id: user.doctors_doctors_user_idTousers.doctor_id },
          data: {
            hospital_id: updateDto.hospital_id ? Number(updateDto.hospital_id) : undefined,
            department_id: updateDto.department_id ? Number(updateDto.department_id) : undefined,
            specialization_id: updateDto.specialization_id ? Number(updateDto.specialization_id) : undefined,
            gender: updateDto.gender,
            qualification: updateDto.qualification,
            medical_license_no: updateDto.medical_license_no,
            experience_years: updateDto.experience_years ? Number(updateDto.experience_years) : undefined,
            consultation_fees: updateDto.consultation_fees ? Number(updateDto.consultation_fees) : undefined,
            modified_by: userId,
            modified_at: new Date()
          }
        });
      } else if (role === 'Patient' && user.patients_patients_user_idTousers?.length > 0) {
        await tx.patients.update({
          where: { patient_id: user.patients_patients_user_idTousers[0].patient_id },
          data: {
            hospital_group_id: updateDto.hospital_group_id ? Number(updateDto.hospital_group_id) : undefined,
            gender: updateDto.gender,
            dob: updateDto.dob ? new Date(updateDto.dob) : undefined,
            blood_group_id: updateDto.blood_group_id ? Number(updateDto.blood_group_id) : undefined,
            address: updateDto.address,
            emergency_contact_name: updateDto.emergency_contact_name,
            emergency_contact_number: updateDto.emergency_contact_number,
            modified_by: userId,
            modified_at: new Date()
          }
        });
      } else if (user.employees_employees_user_idTousers) {
        await tx.employees.update({
          where: { employee_id: user.employees_employees_user_idTousers.employee_id },
          data: {
            hospital_id: updateDto.hospital_id ? Number(updateDto.hospital_id) : undefined,
            hospital_group_id: updateDto.hospital_group_id ? Number(updateDto.hospital_group_id) : undefined,
            modified_by: userId,
            modified_at: new Date()
          }
        });
      }

      return updatedUser;
    });
  }

  async toggleStatus(userId: number, is_active: boolean) {
    const user = await this.prisma.users.update({
      where: { user_id: userId },
      data: { is_active }
    });
    return { success: true, is_active: user.is_active };
  }
}
