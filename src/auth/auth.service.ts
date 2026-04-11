import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EncryptionService } from './encryption.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterGroupAdminDto } from './dto/register-group-admin.dto';
import { RegisterHospitalAdminDto } from './dto/register-hospital-admin.dto';
import { RegisterReceptionistDto } from './dto/register-receptionist.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as nodemailer from 'nodemailer';

// In-memory OTP store — no database needed
interface OtpEntry {
  otpHash: string;
  userId: number;
  expiresAt: Date;
  verified: boolean; // Marks OTP as verified so reset can proceed
}

@Injectable()
export class AuthService {
  private resetTokens = new Map<string, OtpEntry>();

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private jwtService: JwtService,
    private cloudinaryService: CloudinaryService,
    private configService: ConfigService,
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

  async registerPatient(registerDto: RegisterPatientDto, file?: Express.Multer.File) {
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

    // Upload profile image if provided
    let profileImageUrl: string | null = null;
    if (file) {
      try {
        profileImageUrl = await this.cloudinaryService.uploadImage(file);
      } catch (err) {
        console.error('Image upload failed', err);
      }
    }

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
            profile_image_url: profileImageUrl,
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
            pincode: pincode || "361006",
            state_id: state_id ? Number(state_id) : undefined,
            city_id: city_id ? Number(city_id) : undefined,
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

  // ─── Forgot Password Flow ─────────────────────────────────────────

  /**
   * Step 1: Send OTP to user's email
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();

    // Clean up expired tokens on every request
    this.cleanupExpiredTokens();

    // Find user by email
    const user = await this.prisma.users.findFirst({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Email not found in our records.');
    }

    if (!user.is_active) {
      throw new BadRequestException('This account is inactive. Please contact admin.');
    }

    // Rate limiting: prevent spamming — if an OTP was sent in the last 60 seconds, reject
    const existing = this.resetTokens.get(email);
    if (existing) {
      const timeSinceSent = Date.now() - (existing.expiresAt.getTime() - 10 * 60 * 1000);
      if (timeSinceSent < 60 * 1000) {
        throw new BadRequestException('Please wait 60 seconds before requesting a new OTP.');
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await this.encryptionService.hashPassword(otp);

    // Store in memory (expires in 10 minutes)
    this.resetTokens.set(email, {
      otpHash,
      userId: user.user_id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verified: false,
    });

    // Send email
    try {
      await this.sendOtpEmail(email, otp, user.full_name);
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      this.resetTokens.delete(email);
      throw new InternalServerErrorException('Failed to send OTP email. Please try again.');
    }

    return { message: `OTP has been sent to ${email}` };
  }

  /**
   * Step 2: Verify OTP
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const entry = this.resetTokens.get(email);

    if (!entry) {
      throw new BadRequestException('No OTP was requested for this email. Please request a new one.');
    }

    // Check expiry
    if (new Date() > entry.expiresAt) {
      this.resetTokens.delete(email);
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Verify OTP
    const isValid = await this.encryptionService.comparePassword(dto.otp, entry.otpHash);
    if (!isValid) {
      throw new BadRequestException('Invalid OTP. Please try again.');
    }

    // Mark as verified (so resetPassword can proceed)
    entry.verified = true;
    this.resetTokens.set(email, entry);

    return { message: 'OTP verified successfully. You can now reset your password.' };
  }

  /**
   * Step 3: Reset password (after OTP is verified)
   */
  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const entry = this.resetTokens.get(email);

    if (!entry) {
      throw new BadRequestException('No OTP session found. Please start over.');
    }

    // Check expiry
    if (new Date() > entry.expiresAt) {
      this.resetTokens.delete(email);
      throw new BadRequestException('Session expired. Please request a new OTP.');
    }

    // Ensure OTP was verified first
    if (!entry.verified) {
      throw new BadRequestException('OTP has not been verified yet.');
    }

    // Verify OTP one more time for security
    const isValid = await this.encryptionService.comparePassword(dto.otp, entry.otpHash);
    if (!isValid) {
      throw new BadRequestException('Invalid OTP.');
    }

    // Update password
    const passwordHash = await this.encryptionService.hashPassword(dto.newPassword);
    await this.prisma.users.update({
      where: { user_id: entry.userId },
      data: {
        password_hash: passwordHash,
        password_changed_at: new Date(),
      },
    });

    // Clean up — OTP is consumed
    this.resetTokens.delete(email);

    return { message: 'Password has been reset successfully. You can now login.' };
  }

  // ─── Helper Methods ───────────────────────────────────────────────

  /**
   * Remove expired entries from the in-memory store
   */
  private cleanupExpiredTokens() {
    const now = new Date();
    for (const [email, entry] of this.resetTokens.entries()) {
      if (now > entry.expiresAt) {
        this.resetTokens.delete(email);
      }
    }
  }

  /**
   * Send OTP email using nodemailer
   */
  private async sendOtpEmail(email: string, otp: string, userName: string) {
    const smtpEmail = this.configService.get<string>('SMTP_EMAIL');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');

    if (!smtpEmail || !smtpPassword) {
      throw new Error('SMTP_EMAIL and SMTP_PASSWORD environment variables are required.');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: smtpEmail,
        pass: smtpPassword,
      },
    });

    const mailOptions = {
      from: `"MedCore" <${smtpEmail}>`,
      to: email,
      subject: 'Password Reset OTP - MedCore',
      html: `
      
      <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6; padding: 40px 0; min-height: 100vh;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 24px; text-align: center;">
            <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); backdrop-filter: blur(8px); padding: 12px; border-radius: 16px; margin-bottom: 16px; border: 1px solid rgba(255, 255, 255, 0.3);">
              <div style="background-color: #ffffff; color: #1e3a8a; width: 40px; height: 40px; border-radius: 10px; display: block; text-align: center; font-size: 24px; font-weight: 900; margin: 0 auto; line-height: 40px;">M</div>
            </div>
            <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Verify Your Identity</h1>
          </div>
          
          <!-- Body -->
          <div style="padding: 32px 24px;">
            <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
              Hello <strong>${userName}</strong>,
            </p>
            <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
              We received a request to reset the password for your MedCore account. Use the secure verification code below to proceed:
            </p>
            
            <!-- OTP Box -->
            <div style="background-color: #f8fafc; border: 2px dashed #93c5fd; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
              <div style="font-family: monospace; font-size: 36px; font-weight: 700; color: #1d4ed8; letter-spacing: 12px; margin-left: 12px;">${otp}</div>
            </div>
            
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
              <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 500;">
                ⚠️ This code expires in exactly <span style="font-weight: 800;">10 minutes</span>.
              </p>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 20px; border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 0; margin-bottom: 0;">
              If you didn't request a password reset, you can safely ignore this email. Your account remains secure.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 24px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px;">
              MedCore Hospital Management System
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              &copy; ${new Date().getFullYear()} MedCore. All rights reserved.
            </p>
          </div>
          
        </div>
      </div>
      `
    };

    await transporter.sendMail(mailOptions);
  }
}
