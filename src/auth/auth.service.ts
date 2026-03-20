import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { LoginDto } from './dto/login.dto';
import { EncryptionService } from './encryption.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterGroupAdminDto } from './dto/register-group-admin.dto';
import { RegisterHospitalAdminDto } from './dto/register-hospital-admin.dto';
import { RegisterReceptionistDto } from './dto/register-receptionist.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private jwtService: JwtService,
    private cloudinaryService: CloudinaryService,
  ) { }

  async registerSuperAdmin(registerDto: RegisterSuperAdminDto) {
    const { full_name, email, phone_number, password } = registerDto;

    // Check for existing user
    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [{ email: email }, { phone_number: phone_number }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with given credentials already exists');
    }

    // Find Super Admin role
    const superAdminRole = await this.prisma.roles.findFirst({
      where: { role_name: 'Super Admin' },
    });

    if (!superAdminRole) {
      throw new InternalServerErrorException('Super Admin role not found.');
    }

    // Hash password using EncryptionService
    const passwordHash = await this.encryptionService.hashPassword(password);

    // Create User
    try {
      const newUser = await this.prisma.users.create({
        data: {
          full_name,
          email,
          phone_number,
          password_hash: passwordHash,
          role_id: superAdminRole.role_id,
          is_active: true,
          password_changed_at: new Date(),
        },
      });

      // Return user without password
      const { password_hash, ...result } = newUser;
      return result;
    } catch (error) {
      console.error('Error creating user:', error);
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  async registerGroupAdmin(
    registerDto: RegisterGroupAdminDto,
    file?: Express.Multer.File,
  ) {
    const {
      full_name,
      email,
      phone_number,
      password,
      hospital_group_id,
      joining_date,
    } = registerDto;
    const groupId = Number(hospital_group_id);

    // Check for existing user
    const existingUser = await this.prisma.users.findFirst({
      where: { OR: [{ email }, { phone_number }] },
    });

    if (existingUser) throw new ConflictException('User already exists');

    const role = await this.prisma.roles.findFirst({
      where: { role_name: 'Group Admin' },
    });
    if (!role)
      throw new InternalServerErrorException('Group Admin role not found');

    const passwordHash = await this.encryptionService.hashPassword(password);
    let profileImageUrl: string | null = null;

    if (file) {
      try {
        profileImageUrl = await this.cloudinaryService.uploadImage(file);
      } catch (err) {
        console.error('Image upload failed', err);
        // Decide if we fail the whole request or continue without image. failing is safer.
        throw new InternalServerErrorException('Image upload failed');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: {
          full_name,
          email,
          phone_number,
          password_hash: passwordHash,
          role_id: role.role_id,
          profile_image_url: profileImageUrl,
          is_active: true,
          password_changed_at: new Date(),
        },
      });

      await tx.employees.create({
        data: {
          user_id: newUser.user_id,
          hospital_group_id: groupId,
          employee_type: 'GROUP ADMIN',
          joining_date: new Date(joining_date),
          is_active: true,
          created_by: newUser.user_id,
          modified_by: newUser.user_id,
        },
      });

      const { password_hash, ...result } = newUser;
      return result;
    });
  }

  async registerHospitalAdmin(
    registerDto: RegisterHospitalAdminDto,
    file?: Express.Multer.File,
  ) {
    const {
      full_name,
      email,
      phone_number,
      password,
      hospital_id,
      hospital_group_id,
      joining_date,
    } = registerDto;

    try {
      const hospitalId = Number(hospital_id);
      const hospitalGroupId = Number(hospital_group_id);

      // Check for existing user
      const existingUser = await this.prisma.users.findFirst({
        where: { OR: [{ email }, { phone_number }] },
      });

      if (existingUser) {
        throw new ConflictException('User already exists');
      }

      const role = await this.prisma.roles.findFirst({
        where: { role_name: 'Hospital Admin' },
      });

      if (!role) {
        throw new InternalServerErrorException('Hospital Admin role not found');
      }

      const passwordHash = await this.encryptionService.hashPassword(password);
      let profileImageUrl: string | null = null;

      if (file) {
        try {
          profileImageUrl = await this.cloudinaryService.uploadImage(file);
        } catch (err) {
          throw new InternalServerErrorException('Image upload failed');
        }
      }

      return await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.users.create({
          data: {
            full_name,
            email,
            phone_number,
            password_hash: passwordHash,
            role_id: role.role_id,
            is_active: true,
            profile_image_url: profileImageUrl,
            password_changed_at: new Date(),
          },
        });

        await tx.employees.create({
          data: {
            user_id: newUser.user_id,
            hospital_id: hospitalId, // Linked to Hospital
            hospital_group_id: hospitalGroupId, // Linked to Hospital Group
            employee_type: 'HOSPITAL ADMIN',
            joining_date: new Date(joining_date),
            is_active: true,
            created_by: newUser.user_id,
            modified_by: newUser.user_id,
          },
        });

        // Return user without password
        const { password_hash, ...result } = newUser;
        return result;
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'An unexpected error occurred during registration: ' + error.message,
      );
    }
  }

  async registerReceptionist(
    registerDto: RegisterReceptionistDto,
    file?: Express.Multer.File,
  ) {
    const {
      full_name,
      email,
      phone_number,
      password,
      hospital_id,
      hospital_group_id,
      joining_date,
    } = registerDto;

    try {
      const hospitalId = Number(hospital_id);
      const hospitalGroupId = Number(hospital_group_id);

      // Check for existing user
      const existingUser = await this.prisma.users.findFirst({
        where: { OR: [{ email }, { phone_number }] },
      });

      if (existingUser) {
        throw new ConflictException('User already exists');
      }

      const role = await this.prisma.roles.findFirst({
        where: { role_name: 'Receptionist' },
      });

      if (!role) {
        throw new InternalServerErrorException('Receptionist role not found');
      }

      const passwordHash = await this.encryptionService.hashPassword(password);
      let profileImageUrl: string | null = null;

      if (file) {
        try {
          profileImageUrl = await this.cloudinaryService.uploadImage(file);
        } catch (err) {
          throw new InternalServerErrorException('Image upload failed');
        }
      }

      return await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.users.create({
          data: {
            full_name,
            email,
            phone_number,
            password_hash: passwordHash,
            role_id: role.role_id,
            is_active: true,
            profile_image_url: profileImageUrl,
            password_changed_at: new Date(),
          },
        });

        await tx.employees.create({
          data: {
            user_id: newUser.user_id,
            hospital_id: hospitalId,
            hospital_group_id: hospitalGroupId,
            employee_type: 'RECEPTIONIST',
            joining_date: new Date(joining_date),
            is_active: true,
            created_by: newUser.user_id,
            modified_by: newUser.user_id,
          },
        });

        // Return user without password
        const { password_hash, ...result } = newUser;
        return result;
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'An unexpected error occurred during registration: ' + error.message,
      );
    }
  }

  async registerPatient(registerDto: RegisterPatientDto) {
    const {
      full_name,
      email,
      phone_number,
      password,
      gender,
      dob,
      address,
      pincode,
      state_id,
      city_id,
      emergency_contact_name,
      emergency_contact_number,
    } = registerDto;

    // Check for existing user
    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [{ email: email }, { phone_number: phone_number }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with given credentials already exists');
    }

    // Find Patient role
    const patientRole = await this.prisma.roles.findFirst({
      where: { role_name: 'Patient' },
    });

    if (!patientRole) {
      throw new InternalServerErrorException(
        'Patient role configuration missing. Please contact admin.',
      );
    }

    // Hash password using EncryptionService
    const passwordHash = await this.encryptionService.hashPassword(password);

    try {
      // Use transaction for atomicity
      const result = await this.prisma.$transaction(async (prisma) => {
        // 1. Create User
        const newUser = await prisma.users.create({
          data: {
            full_name,
            email,
            phone_number,
            password_hash: passwordHash,
            role_id: patientRole.role_id,
            is_active: true,
            password_changed_at: new Date(),
          },
        });

        // 2. Generate UHID
        let patientNo = '';

        // Find default hospital group if none is specified (self-registration usually doesn't have one)
        // Adjust logic if self-registration allows choosing hospital. We use the first one as default.
        const defaultGroup = await prisma.hospital_groups.findFirst({
          orderBy: { hospital_group_id: 'asc' }
        });

        if (defaultGroup && defaultGroup.group_code) {
          let counter = await prisma.group_counters.findUnique({
            where: {
              hospital_group_id_counter_type: {
                hospital_group_id: defaultGroup.hospital_group_id,
                counter_type: 'UHID'
              }
            }
          });

          if (!counter) {
            counter = await prisma.group_counters.create({
              data: {
                hospital_group_id: defaultGroup.hospital_group_id,
                counter_type: 'UHID',
                current_value: 0
              }
            });
          }

          const updatedCounter = await prisma.group_counters.update({
            where: { counter_id: counter.counter_id },
            data: { current_value: { increment: 1 } }
          });

          const seq = updatedCounter.current_value.toString().padStart(4, '0');
          patientNo = `UHID-${defaultGroup.group_code}-${seq}`;
        } else {
          patientNo = `P-${Date.now()}`;
        }

        // Helper: calculate minor
        const dobDate = new Date(dob);
        let isMinor = false;
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
          age--;
        }
        if (age < 18) isMinor = true;

        // 3. Create Patient Profile
        await prisma.patients.create({
          data: {
            user_id: newUser.user_id,
            patient_no: patientNo,
            gender: gender,
            dob: dobDate,
            is_minor: isMinor,
            blood_group_id: registerDto.blood_group_id ? parseInt(registerDto.blood_group_id) : undefined,
            hospital_group_id: defaultGroup ? defaultGroup.hospital_group_id : undefined,
            address: address,
            pincode: pincode,
            state_id: Number(state_id),
            city_id: Number(city_id),
            emergency_contact_name: emergency_contact_name,
            emergency_contact_number: emergency_contact_number,
            created_by: newUser.user_id,
            modified_by: newUser.user_id,
          },
        });

        return newUser;
      });

      // Return user without password
      const { password_hash, ...userResult } = result;

      // Generate Token for Auto-Login
      const payload = {
        sub: userResult.user_id,
        role: 'Patient', // We know the role is Patient here
        email: userResult.email,
      };

      return userResult;
    } catch (error) {
      console.error('Error creating patient:', error);
      throw new InternalServerErrorException('Failed to register patient');
    }
  }

  async login(loginDto: LoginDto) {
    const { identifier, password } = loginDto;

    // Find user by email or phone
    const user = await this.prisma.users.findFirst({
      where: {
        OR: [{ email: identifier }, { phone_number: identifier }],
      },
      include: {
        roles: true,
        employees_employees_user_idTousers: true,
        doctors_doctors_user_idTousers: true,
        patients_patients_user_idTousers: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials'); // Generic message for security
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Verify password
    const isPasswordValid = await this.encryptionService.comparePassword(
      password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last_login_at
    await this.prisma.users.update({
      where: { user_id: user.user_id },
      data: { last_login_at: new Date() },
    });

    // Return user info and token
    const {
      password_hash,
      employees_employees_user_idTousers,
      doctors_doctors_user_idTousers,
      patients_patients_user_idTousers,
      ...userResult
    } = user;

    // Map Prisma's generated relation names to clean arrays for frontend
    const frontendUser = {
      ...userResult,
      employees: employees_employees_user_idTousers
        ? [employees_employees_user_idTousers]
        : [],
      doctors: doctors_doctors_user_idTousers
        ? [doctors_doctors_user_idTousers]
        : [],
      patients: patients_patients_user_idTousers || [],
    };

    const payload = {
      sub: user.user_id,
      role: user.roles?.role_name,
      email: user.email,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: frontendUser,
    };
  }
}
