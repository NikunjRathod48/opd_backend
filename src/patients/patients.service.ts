import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { EncryptionService } from '../auth/encryption.service';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) { }

  async create(createPatientDto: CreatePatientDto, req: any) {
    let {
      full_name,
      dob,
      gender,
      blood_group_id,
      phone_number,
      email,
      address,
      password,
      city_id,
      state_id,
      pincode,
      emergency_contact_name,
      emergency_contact_number,
      is_walk_in,
      hospital_group_id,
    } = createPatientDto;

    // Determine hospital_group_id: DTO → JWT → look up from doctor/employee relation
    if (!hospital_group_id) {
      if (req.user?.hospitalGroupId) {
        hospital_group_id = req.user.hospitalGroupId;
      } else if (req.user?.userId) {
        // Look up through the creating user's doctor or employee record
        const doctor = await this.prisma.doctors.findFirst({
          where: { user_id: req.user.userId },
          include: { hospitals: { select: { hospital_group_id: true } } },
        });
        if (doctor?.hospitals?.hospital_group_id) {
          hospital_group_id = doctor.hospitals.hospital_group_id;
        } else {
          const employee = await this.prisma.employees.findFirst({
            where: { user_id: req.user.userId },
            select: { hospital_group_id: true },
          });
          if (employee?.hospital_group_id) {
            hospital_group_id = employee.hospital_group_id;
          }
        }
      }
    }

    // For walk-in patients: skip email/phone uniqueness check when not provided
    // and generate safe sentinel values instead of using random timestamps
    const isWalkIn = is_walk_in ?? false;
    const uniqueTs = Date.now();
    const safeEmail = email || (isWalkIn ? `walkin-${uniqueTs}@noemail.local` : undefined);
    const safePhone = phone_number;

    // 1. Check for existing user only when real email/phone provided
    if (email || phone_number) {
      const existingUser = await this.prisma.users.findFirst({
        where: {
          OR: [
            email ? { email } : undefined,
            phone_number ? { phone_number } : undefined,
          ].filter(Boolean) as any[],
        },
      });
      if (existingUser) {
        throw new ConflictException(
          'User with this email or phone already exists.',
        );
      }
    }

    // 2. Get Patient Role
    const patientRole = await this.prisma.roles.findFirst({
      where: { role_name: 'Patient' },
    });

    if (!patientRole) {
      throw new InternalServerErrorException('Patient role not found.');
    }

    // 3. Hash a random password (walk-in patients cannot log in — is_active: false)
    const rawPassword = password || `WalkIn@${uniqueTs}`;
    const passwordHash = await this.encryptionService.hashPassword(rawPassword);

    // 4. Transaction: Create User (inactive) -> Create Patient
    return this.prisma.$transaction(async (tx) => {
      // A. Create User record (inactive, walk-ins cannot log in)
      const newUser = await tx.users.create({
        data: {
          full_name,
          email: safeEmail ?? `walkin-${uniqueTs}@noemail.local`,
          phone_number: safePhone ?? `0000000${uniqueTs.toString().slice(-5)}`,
          password_hash: passwordHash,
          role_id: patientRole.role_id,
          is_active: false,
          password_changed_at: new Date(),
        },
      });

      // B. Generate UHID
      let patientNo = '';

      if (hospital_group_id) {
        const group = await tx.hospital_groups.findUnique({
          where: { hospital_group_id: hospital_group_id },
        });

        if (group && group.group_code) {
          let counter = await tx.group_counters.findUnique({
            where: {
              hospital_group_id_counter_type: {
                hospital_group_id: hospital_group_id,
                counter_type: 'UHID',
              },
            },
          });

          if (!counter) {
            try {
              counter = await tx.group_counters.create({
                data: {
                  hospital_group_id,
                  counter_type: 'UHID',
                  current_value: 0,
                },
              });
            } catch (e) {
              counter = await tx.group_counters.findUniqueOrThrow({
                where: {
                  hospital_group_id_counter_type: {
                    hospital_group_id: hospital_group_id,
                    counter_type: 'UHID',
                  },
                },
              });
            }
          }

          // Increment
          const updatedCounter = await tx.group_counters.update({
            where: { counter_id: counter.counter_id },
            data: { current_value: { increment: 1 } },
          });

          // Format: UHID-{GroupCode}-{Seq}
          const seq = updatedCounter.current_value.toString().padStart(4, '0');
          patientNo = `UHID-${group.group_code}-${seq}`;
        }
      }

      if (!patientNo) {
        patientNo = `TEMP-${Date.now()}`;
      }

      // C. Create Patient
      const newPatient = await tx.patients.create({
        data: {
          user_id: newUser.user_id,
          patient_no: patientNo,
          hospital_group_id,
          gender,
          dob: new Date(dob),
          is_minor: this.calculateIsMinor(new Date(dob)),
          blood_group_id: blood_group_id ? parseInt(blood_group_id) : undefined,
          phone_number,
          email,
          address: address || '',
          city_id,
          state_id,
          pincode: pincode || '',
          emergency_contact_name: emergency_contact_name || '',
          emergency_contact_number: emergency_contact_number || '',
          is_walk_in: is_walk_in ?? false,
          created_by: req.user.userId,
          modified_by: req.user.userId,
        },
      });

      return newPatient;
    });
  }

  async update(id: number, updateData: any, req: any) {
    const { full_name, ...patientData } = updateData;

    // Find patient to get user_id
    const patient = await this.prisma.patients.findUnique({
      where: { patient_id: id },
    });

    if (!patient) {
      throw new Error(`Patient with ID ${id} not found`);
    }

    // Check for email/phone duplicates among OTHER users
    const orConditions: any[] = [];
    if (patientData.email) orConditions.push({ email: patientData.email });
    if (patientData.phone_number) orConditions.push({ phone_number: patientData.phone_number });

    if (orConditions.length > 0) {
      const existingUser = await this.prisma.users.findFirst({
        where: {
          OR: orConditions,
          user_id: { not: patient.user_id as number }
        }
      });
      if (existingUser) {
        if (existingUser.email && existingUser.email === patientData.email) {
          throw new ConflictException('Email already in use.');
        }
        if (existingUser.phone_number && existingUser.phone_number === patientData.phone_number) {
          throw new ConflictException('Phone number already in use.');
        }
        throw new ConflictException('Email or phone already in use.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (full_name && patient.user_id) {
        await tx.users.update({
          where: { user_id: patient.user_id },
          data: { full_name },
        });
      }

      const sanitizedData: any = { ...patientData };
      if (sanitizedData.hospital_group_id)
        sanitizedData.hospital_group_id = Number(
          sanitizedData.hospital_group_id,
        );
      if (sanitizedData.blood_group_id)
        sanitizedData.blood_group_id = Number(sanitizedData.blood_group_id);
      if (sanitizedData.state_id)
        sanitizedData.state_id = Number(sanitizedData.state_id);
      if (sanitizedData.city_id)
        sanitizedData.city_id = Number(sanitizedData.city_id);
      if (sanitizedData.dob)
        sanitizedData.dob = new Date(sanitizedData.dob);

      if (patientData.email && patient.user_id) {
        await tx.users.update({
          where: { user_id: patient.user_id },
          data: { email: patientData.email },
        });
      }
      if (patientData.phone_number && patient.user_id) {
        await tx.users.update({
          where: { user_id: patient.user_id },
          data: { phone_number: patientData.phone_number },
        });
      }

      return tx.patients.update({
        where: { patient_id: id },
        data: {
          ...sanitizedData,
          modified_by: req.user.userId,
          modified_at: new Date(),
        },
      });
    });
  }

  async search(query: string, hospitalGroupId?: number) {
    const where: any = {
      OR: [
        {
          users_patients_user_idTousers: {
            full_name: { contains: query, mode: 'insensitive' },
          },
        },
        { phone_number: { contains: query } },
        { patient_no: { contains: query, mode: 'insensitive' } },
      ],
    };
    if (hospitalGroupId) where.hospital_group_id = hospitalGroupId;

    const patients = await this.prisma.patients.findMany({
      where,
      take: 20,
      include: {
        users_patients_user_idTousers: { select: { full_name: true } },
      },
    });
    return patients.map((p) => ({
      patientid: p.patient_id,
      patientno: p.patient_no,
      full_name: p.users_patients_user_idTousers?.full_name || '',
      phone_number: p.phone_number,
      gender: p.gender,
      dob: p.dob,
    }));
  }

  async findAll(query?: any) {
    const where: any = {};
    if (query?.hospital_id) {
      where.opd_visits = {
        some: {
          hospital_id: Number(query.hospital_id),
        },
      };
    }

    const patients = await this.prisma.patients.findMany({
      where,
      include: {
        users_patients_user_idTousers: true,
        blood_groups: true,
        cities: true,
        states: true,
      },
    });

    return patients.map((p) => ({
      ...p,
      users: p.users_patients_user_idTousers,
    }));
  }

  private calculateIsMinor(dob: Date): boolean {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age < 18;
  }
}
