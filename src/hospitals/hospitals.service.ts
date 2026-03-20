import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalAdminDto } from './dto/update-hospital-admin.dto';
import { UpdateReceptionistDto } from './dto/update-receptionist.dto';

@Injectable()
export class HospitalsService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(createHospitalDto: CreateHospitalDto, userId: number) {
    const data = this.prepareData(createHospitalDto);
    return this.prisma.hospitals.create({
      data: {
        ...data,
        created_by: userId,
        modified_by: userId,
      },
    });
  }

  async update(
    id: number,
    updateHospitalDto: CreateHospitalDto,
    userId: number,
  ) {
    // Check if hospital exists
    const hospital = await this.prisma.hospitals.findUnique({
      where: { hospital_id: id },
    });
    if (!hospital) {
      throw new Error(`Hospital with ID ${id} not found`);
    }

    const data = this.prepareData(updateHospitalDto);
    return this.prisma.hospitals.update({
      where: { hospital_id: id },
      data: {
        ...data,
        modified_by: userId,
      },
    });
  }

  private prepareData(dto: CreateHospitalDto) {
    const { opening_date, opening_time, closing_time, ...rest } = dto;

    // Convert opening_time string (HH:MM) to Date object if present
    let openingTimeDate: Date | null = null;
    if (opening_time) {
      const [hours, minutes] = opening_time.split(':');
      openingTimeDate = new Date();
      openingTimeDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    let closingTimeDate: Date | null = null;
    if (closing_time) {
      const [hours, minutes] = closing_time.split(':');
      closingTimeDate = new Date();
      closingTimeDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    return {
      ...rest,
      opening_date: new Date(opening_date), // Convert YYYY-MM-DD string to Date
      opening_time: openingTimeDate,
      closing_time: closingTimeDate,
    };
  }

  async findAll() {
    return this.prisma.hospitals.findMany({
      include: {
        hospital_groups: true,
        cities: true,
        states: true,
      },
    });
  }

  async findAllAdmins() {
    return this.prisma.users.findMany({
      where: {
        roles: {
          role_name: 'Hospital Admin',
        },
      },
      include: {
        employees_employees_user_idTousers: {
          include: {
            hospitals: true, // Include Hospital Details
          },
        },
      },
    });
  }

  async updateAdmin(id: number, dto: UpdateHospitalAdminDto) {
    return this.prisma.$transaction(async (tx) => {
      // Update User details
      const user = await tx.users.update({
        where: { user_id: id },
        data: {
          full_name: dto.full_name,
          email: dto.email,
          phone_number: dto.phone_number,
        },
      });

      // Update Employee details if joining_date is present
      if (dto.joining_date) {
        await tx.employees.updateMany({
          where: { user_id: id },
          data: {
            joining_date: new Date(dto.joining_date),
          },
        });
      }

      return user;
    });
  }

  async toggleAdminStatus(id: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: id },
    });

    if (!user) throw new Error('User not found');

    const newStatus = !user.is_active;

    return this.prisma.$transaction([
      this.prisma.users.update({
        where: { user_id: id },
        data: { is_active: newStatus },
      }),
      this.prisma.employees.updateMany({
        where: { user_id: id },
        data: { is_active: newStatus },
      }),
    ]);
  }

  async findAllReceptionists() {
    return this.prisma.users.findMany({
      where: {
        roles: {
          role_name: 'Receptionist',
        },
      },
      include: {
        employees_employees_user_idTousers: {
          include: {
            hospitals: true, // Include Hospital Details
          },
        },
      },
    });
  }

  async updateReceptionist(
    id: number,
    dto: UpdateReceptionistDto,
    file?: Express.Multer.File,
  ) {
    let profileImageUrl: string | null = null;
    if (file) {
      try {
        profileImageUrl = await this.cloudinaryService.uploadImage(file);
      } catch (err) {
        console.error('Image upload failed', err);
        throw new InternalServerErrorException('Image upload failed');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Update User details
      const user = await tx.users.update({
        where: { user_id: id },
        data: {
          full_name: dto.full_name,
          email: dto.email,
          phone_number: dto.phone_number,
          ...(profileImageUrl && { profile_image_url: profileImageUrl }),
        },
      });

      // Update Employee details if joining_date is present
      if (dto.joining_date) {
        await tx.employees.updateMany({
          where: { user_id: id },
          data: {
            joining_date: new Date(dto.joining_date),
          },
        });
      }

      return user;
    });
  }

  async toggleReceptionistStatus(id: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: id },
    });

    if (!user) throw new Error('User not found');

    const newStatus = !user.is_active;

    return this.prisma.$transaction([
      this.prisma.users.update({
        where: { user_id: id },
        data: { is_active: newStatus },
      }),
      this.prisma.employees.updateMany({
        where: { user_id: id },
        data: { is_active: newStatus },
      }),
    ]);
  }
}
