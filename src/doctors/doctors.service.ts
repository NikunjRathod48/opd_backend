import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import * as bcrypt from 'bcrypt';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class DoctorsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(createDoctorDto: CreateDoctorDto, file?: Express.Multer.File) {
    const {
      full_name,
      email,
      phone_number,
      password,
      hospital_id,
      department_id,
      specialization_id,
      gender,
      qualification,
      medical_license_no,
      experience_years,
      consultation_fees,
      description,
      is_available,
    } = createDoctorDto;

    // Check existing User
    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [{ email }, { phone_number }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or phone number already exists.',
      );
    }

    // Check existing License
    const existingLicense = await this.prisma.doctors.findUnique({
      where: { medical_license_no },
    });

    if (existingLicense) {
      throw new ConflictException('Medical license number already registered.');
    }

    const role = await this.prisma.roles.findFirst({
      where: { role_name: 'Doctor' },
    });

    if (!role) {
      throw new InternalServerErrorException('Doctor role not found');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const doctorRoleId = role.role_id;

    // Handle Image Upload
    let profileImageUrl: string | null = null;
    if (file) {
      try {
        profileImageUrl = await this.cloudinary.uploadImage(file);
      } catch (error) {
        console.error('Image upload failed:', error);
        // Optional: throw exception or continue without image
        // throw new InternalServerErrorException('Image upload failed');
      }
    }

    return this.prisma.$transaction(async (prisma) => {
      // 1. Create User
      const user = await prisma.users.create({
        data: {
          full_name,
          email,
          phone_number,
          password_hash: hashedPassword,
          role_id: doctorRoleId,
          is_active: true,
          profile_image_url: profileImageUrl,
        },
      });

      // 2. Create Doctor
      const doctor = await prisma.doctors.create({
        data: {
          user_id: user.user_id,
          hospital_id: Number(hospital_id),
          department_id: Number(department_id),
          specialization_id: Number(specialization_id),
          gender,
          qualification,
          medical_license_no,
          experience_years: experience_years ? Number(experience_years) : 0,
          consultation_fees: consultation_fees ? Number(consultation_fees) : 0,
          description,
          is_available:
            is_available !== undefined ? String(is_available) === 'true' : true,
          created_by: user.user_id,
          modified_by: user.user_id,
        },
      });

      return { user, doctor };
    });
  }

  async findAll(query: any) {
    const { name, department_id, specialization_id, hospital_id, status } =
      query;

    const where: any = {};

    if (name) {
      where.users_doctors_user_idTousers = {
        full_name: { contains: name, mode: 'insensitive' },
      };
    }

    if (department_id) where.department_id = Number(department_id);
    if (specialization_id) where.specialization_id = Number(specialization_id);
    if (hospital_id) where.hospital_id = Number(hospital_id);
    if (status) where.is_active = status === 'active';

    if (status && (status === 'active' || status === 'inactive')) {
      where.users_doctors_user_idTousers = {
        ...where.users_doctors_user_idTousers,
        is_active: status === 'active',
      };
    }

    const doctors = await this.prisma.doctors.findMany({
      where,
      include: {
        users_doctors_user_idTousers: {
          select: {
            full_name: true,
            email: true,
            phone_number: true,
            profile_image_url: true,
            is_active: true,
          },
        },
        departments_master: true,
        specializations: true,
        hospitals: { select: { hospital_name: true } },
      },
    });

    return doctors.map((doc) => ({
      doctor_id: doc.doctor_id,
      user_id: doc.user_id,
      name: doc.users_doctors_user_idTousers.full_name,
      email: doc.users_doctors_user_idTousers.email,
      phone: doc.users_doctors_user_idTousers.phone_number,
      gender: doc.gender,
      profile_image: doc.users_doctors_user_idTousers.profile_image_url,
      is_active: doc.users_doctors_user_idTousers.is_active,
      hospital_id: doc.hospital_id,
      hospital_name: doc.hospitals?.hospital_name || 'Unknown',
      department_id: doc.department_id,
      department_name: doc.departments_master?.department_name || 'Unknown',
      specialization_id: doc.specialization_id,
      specialization_name:
        doc.specializations?.specialization_name || 'Unknown',
      qualification: doc.qualification,
      medical_license_no: doc.medical_license_no,
      experience_years: doc.experience_years,
      consultation_fees: doc.consultation_fees,
      is_available: doc.is_available,
    }));
  }

  async findOne(id: number) {
    const doctor = await this.prisma.doctors.findUnique({
      where: { doctor_id: id },
      include: {
        users_doctors_user_idTousers: true,
        departments_master: true,
        specializations: true,
        hospitals: true,
      },
    });

    if (!doctor) throw new NotFoundException('Doctor not found');

    return doctor;
  }

  async update(
    id: number,
    updateDoctorDto: UpdateDoctorDto,
    file?: Express.Multer.File,
  ) {
    const doctor = await this.prisma.doctors.findUnique({
      where: { doctor_id: id },
      include: { users_doctors_user_idTousers: true },
    });

    if (!doctor) throw new NotFoundException('Doctor not found');

    const {
      full_name,
      email,
      phone_number,
      hospital_id,
      department_id,
      specialization_id,
      gender,
      qualification,
      experience_years,
      consultation_fees,
      description,
      is_available,
    } = updateDoctorDto;

    // Handle Image Upload
    let profileImageUrl = doctor.users_doctors_user_idTousers.profile_image_url;
    if (file) {
      profileImageUrl = await this.cloudinary.uploadImage(file).catch(() => {
        throw new ConflictException('Image upload failed');
      });
    }

    return this.prisma.$transaction(async (prisma) => {
      // Update User
      await prisma.users.update({
        where: { user_id: doctor.user_id },
        data: {
          full_name,
          email,
          phone_number,
          profile_image_url: profileImageUrl,
        },
      });

      // Update Doctor
      const updatedDoctor = await prisma.doctors.update({
        where: { doctor_id: id },
        data: {
          hospital_id: hospital_id ? Number(hospital_id) : undefined,
          department_id: department_id ? Number(department_id) : undefined,
          specialization_id: specialization_id
            ? Number(specialization_id)
            : undefined,
          gender,
          qualification,
          medical_license_no: updateDoctorDto.medical_license_no,
          experience_years: experience_years
            ? Number(experience_years)
            : undefined,
          consultation_fees: consultation_fees
            ? Number(consultation_fees)
            : undefined,
          description,
          is_available:
            is_available !== undefined
              ? String(is_available) === 'true'
              : undefined,
        },
      });

      return updatedDoctor;
    });
  }

  async getSpecializations() {
    return this.prisma.specializations.findMany({
      where: { is_active: true },
    });
  }

  async getHospitalDepartments(hospitalId: number) {
    return this.prisma.hospital_departments.findMany({
      where: {
        hospital_id: hospitalId,
        is_active: true,
      },
      include: {
        departments_master: true,
      },
    });
  }

  // --- Availability Management ---

  async getAvailability(doctorId: number) {
    const availability = await this.prisma.doctor_availability.findMany({
      where: { doctor_id: doctorId },
      orderBy: { day_of_week: 'asc' },
    });

    const formatTime = (date: Date) => {
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // If no availability set, return default empty schedule for 7 days
    if (availability.length === 0) {
      return Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        start_time: '09:00',
        end_time: '17:00',
        max_appointments: 10,
        is_available: false, // Default to unavailable until set
      }));
    }

    return availability.map((a) => ({
      day_of_week: a.day_of_week - 1,
      start_time: formatTime(a.start_time),
      end_time: formatTime(a.end_time),
      max_appointments: a.max_appointments,
      is_available: a.is_available ?? false,
    }));
  }

  async updateAvailability(doctorId: number, schedule: any[]) {
    if (!Array.isArray(schedule)) {
      console.error('Invalid schedule format: not an array');
      throw new InternalServerErrorException('Invalid schedule data format');
    }

    // Helper to convert HH:mm to Date safely (Treating input as UTC to store as-is)
    const toDate = (timeStr: string) => {
      if (!timeStr || typeof timeStr !== 'string') {
        console.error(`Invalid time string: ${timeStr}`);
        throw new InternalServerErrorException(
          `Invalid time format: ${timeStr}`,
        );
      }
      const parts = timeStr.split(':');
      if (parts.length !== 2) {
        console.error(`Invalid time format (no colon): ${timeStr}`);
        throw new InternalServerErrorException(
          `Invalid time format: ${timeStr}`,
        );
      }
      const [hours, minutes] = parts.map(Number);
      if (isNaN(hours) || isNaN(minutes)) {
        console.error(`Invalid time numbers: ${timeStr}`);
        throw new InternalServerErrorException(
          `Invalid time values: ${timeStr}`,
        );
      }

      const date = new Date();
      date.setUTCHours(hours, minutes, 0, 0);

      return date;
    };

    try {
      return await this.prisma.$transaction(async (prisma) => {
        // 1. Delete existing availability
        await prisma.doctor_availability.deleteMany({
          where: { doctor_id: doctorId },
        });

        // 2. Create new records
        for (const day of schedule) {
          await prisma.doctor_availability.create({
            data: {
              doctor_id: doctorId,
              day_of_week: day.day_of_week + 1,
              start_time: toDate(day.start_time),
              end_time: toDate(day.end_time),
              max_appointments: Number(day.max_appointments),
              is_available: Boolean(day.is_available),
            },
          });
        }
        return { success: true };
      });
    } catch (error) {
      console.error('Error updating availability transaction:', error);
      throw new InternalServerErrorException(
        `Failed to update availability: ${error.message}`,
      );
    }
  }
}
