import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { IdGeneratorService } from '../utils/id-generator.service';
import { OpdService } from '../opd/opd.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private idGenerator: IdGeneratorService,
    @Inject(forwardRef(() => OpdService))
    private opdService: OpdService,
  ) {}

  async getAvailability(doctorId: number, dateStr: string, patientId?: number) {
    // Parse the date strictly from the YYYY-MM-DD part to avoid local timezone shifts
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    // DB stores day_of_week as 1-7 (Sun=1, Mon=2, ..., Sat=7)
    // JS getUTCDay() returns 0-6 (Sun=0, Mon=1, ..., Sat=6)
    // So we add 1 to align with the DB convention
    const dayOfWeek = date.getUTCDay() + 1;

    // Check if this patient already has an active appointment with this doctor on this date
    let existingAppointment: { time: string; status: string } | null = null;
    if (patientId) {
      // Resolve patient_id: frontend may send user_id instead of patient_id
      let resolvedPatientId = patientId;
      const patientExists = await this.prisma.patients.findUnique({
        where: { patient_id: resolvedPatientId },
      });
      if (!patientExists) {
        const patientByUserId = await this.prisma.patients.findFirst({
          where: { user_id: resolvedPatientId },
        });
        if (patientByUserId) {
          resolvedPatientId = patientByUserId.patient_id;
        }
      }

      const existing = await this.prisma.appointments.findFirst({
        where: {
          patient_id: resolvedPatientId,
          doctor_id: doctorId,
          appointment_date: date,
          appointment_status: { notIn: ['Cancelled', 'No-Show'] },
        },
        select: { appointment_time: true, appointment_status: true },
      });
      if (existing) {
        existingAppointment = {
          time: existing.appointment_time.toISOString().split('T')[1].substring(0, 5),
          status: existing.appointment_status,
        };
      }
    }

    const availability = await this.prisma.doctor_availability.findFirst({
      where: {
        doctor_id: doctorId,
        day_of_week: dayOfWeek,
        is_available: true,
      },
    });

    if (!availability) {
      return { slots: [], existingAppointment };
    }

    const slots: any[] = [];
    const capacityPerSlot = 3; // Fixed configuration

    const startHour = availability.start_time.getUTCHours();
    const startMin = availability.start_time.getUTCMinutes();
    const endHour = availability.end_time.getUTCHours();
    const endMin = availability.end_time.getUTCMinutes();

    const appointments = await this.prisma.appointments.findMany({
      where: {
        doctor_id: doctorId,
        appointment_date: date,
        appointment_status: { notIn: ['Cancelled', 'No-Show'] },
      },
      select: { appointment_time: true },
    });

    const bookedCounts: Record<string, number> = {};
    for (const apt of appointments) {
      const timeStr = apt.appointment_time.toISOString().split('T')[1].substring(0, 5);
      bookedCounts[timeStr] = (bookedCounts[timeStr] || 0) + 1;
    }

    let current = new Date(Date.UTC(1970, 0, 1, startHour, startMin));
    const end = new Date(Date.UTC(1970, 0, 1, endHour, endMin));

    while (current < end) {
      const hh = String(current.getUTCHours()).padStart(2, '0');
      const mm = String(current.getUTCMinutes()).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      const bookedCount = bookedCounts[timeStr] || 0;
      slots.push({
        time: timeStr,
        capacity: capacityPerSlot,
        booked: bookedCount,
        isFull: bookedCount >= capacityPerSlot,
      });

      current = new Date(current.getTime() + 15 * 60000); // 15 min slots
    }

    return { slots, existingAppointment };
  }

  async create(createAppointmentDto: CreateAppointmentDto, userId: number) {
    const appointmentNo = await this.idGenerator.generateAppointmentNumber(
      createAppointmentDto.hospital_id,
      userId,
    );

    // Resolve patient_id: the frontend may send user_id instead of patient_id,
    // or may send null/undefined when the patient profile wasn't loaded yet.
    let resolvedPatientId = createAppointmentDto.patient_id;

    if (resolvedPatientId) {
      // Verify the patient_id actually exists
      const patientExists = await this.prisma.patients.findUnique({
        where: { patient_id: resolvedPatientId },
      });
      if (!patientExists) {
        // Maybe frontend sent user_id as patient_id — try resolving
        const patientByUserId = await this.prisma.patients.findFirst({
          where: { user_id: resolvedPatientId },
        });
        if (patientByUserId) {
          resolvedPatientId = patientByUserId.patient_id;
        } else {
          throw new Error('Patient not found. Please ensure the patient is registered.');
        }
      }
    } else {
      // patient_id is null/undefined — resolve from JWT userId
      const patientByUserId = await this.prisma.patients.findFirst({
        where: { user_id: userId },
      });
      if (patientByUserId) {
        resolvedPatientId = patientByUserId.patient_id;
      } else {
        throw new Error('Patient not found. Please ensure the patient is registered.');
      }
    }

    // Parse date as UTC to avoid local timezone offset shifting the stored value
    const [year, month, day] = createAppointmentDto.appointment_date.split('-').map(Number);
    const appointmentDate = new Date(Date.UTC(year, month - 1, day));

    const timeStr = createAppointmentDto.appointment_time.substring(0, 5);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const appointmentTime = new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));

    const capacityPerSlot = 3;

    return this.prisma.$transaction(async (tx) => {
      // 0. Prevent duplicate: same patient + same doctor + same date
      const existingPatientAppointment = await tx.appointments.findFirst({
        where: {
          patient_id: resolvedPatientId,
          doctor_id: createAppointmentDto.doctor_id,
          appointment_date: appointmentDate,
          appointment_status: { notIn: ['Cancelled', 'No-Show'] },
        },
      });

      if (existingPatientAppointment) {
        throw new Error('You already have an appointment with this doctor on this date.');
      }

      // 1. Re-check slot capacity atomically
      const existingSlotAppointments = await tx.appointments.findMany({
        where: {
          doctor_id: createAppointmentDto.doctor_id,
          appointment_date: appointmentDate,
          appointment_status: { notIn: ['Cancelled', 'No-Show'] },
        },
        select: { appointment_time: true },
      });

      const bookedCount = existingSlotAppointments.filter(
        (a) => a.appointment_time.toISOString().split('T')[1].substring(0, 5) === timeStr
      ).length;

      if (bookedCount >= capacityPerSlot) {
        throw new Error('Slot capacity reached. Please select another slot.');
      }

      // 2. Create Appointment
      const appointment = await tx.appointments.create({
        data: {
          hospital_id: createAppointmentDto.hospital_id,
          patient_id: resolvedPatientId,
          doctor_id: createAppointmentDto.doctor_id,
          appointment_no: appointmentNo,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          appointment_status: 'Scheduled',
          remarks: createAppointmentDto.remarks,
          created_by: userId,
          modified_by: userId,
        },
      });

      // 3. Queue Generation
      let dailyQueue = await tx.daily_queues.findFirst({
        where: {
          hospital_id: createAppointmentDto.hospital_id,
          doctor_id: createAppointmentDto.doctor_id,
          queue_date: appointmentDate,
        },
      });

      if (!dailyQueue) {
        dailyQueue = await tx.daily_queues.create({
          data: {
            hospital_id: createAppointmentDto.hospital_id,
            doctor_id: createAppointmentDto.doctor_id,
            queue_date: appointmentDate,
            status: 'Active',
            created_by: userId,
            modified_by: userId,
          },
        });
      }

      // 4. Token Generation with proper ordering consideration
      const lastToken = await tx.queue_tokens.findFirst({
        where: { daily_queue_id: dailyQueue.daily_queue_id },
        orderBy: { token_number: 'desc' },
      });
      const nextTokenNumber = lastToken ? lastToken.token_number + 1 : 1;

      await tx.queue_tokens.create({
        data: {
          daily_queue_id: dailyQueue.daily_queue_id,
          token_number: nextTokenNumber,
          status: 'Waiting',
          visit_type: 'APPOINTMENT',
          priority: 'HIGH',
          appointment_id: appointment.appointment_id,
        },
      });

      return appointment;
    });
  }

  async findAll(query: any) {
    const {
      hospital_id,
      doctor_id,
      patient_id,
      patient_user_id,
      date,
      status,
    } = query;
    const where: any = { is_active: true };

    if (hospital_id) where.hospital_id = +hospital_id;
    if (doctor_id) where.doctor_id = +doctor_id;
    if (patient_id) where.patient_id = +patient_id;
    if (status && status !== 'All') where.appointment_status = status;

    if (patient_user_id) {
      where.patients = { user_id: +patient_user_id };
    }

    // Date filtering: Match exact date
    if (date) {
      where.appointment_date = new Date(date);
    }

    const appointments = await this.prisma.appointments.findMany({
      where,
      include: {
        patients: {
          include: {
            users_patients_user_idTousers: { select: { full_name: true } },
          },
        },
        doctors: {
          include: {
            users_doctors_user_idTousers: { select: { full_name: true } },
          },
        },
      },
      orderBy: { appointment_date: 'desc' },
    });

    return appointments.map((apt) => ({
      appointmentid: apt.appointment_id,
      hospitalid: apt.hospital_id,
      patientid: apt.patient_id,
      doctorid: apt.doctor_id,
      appointmentdatetime: `${apt.appointment_date.toISOString().split('T')[0]}T${apt.appointment_time.toISOString().split('T')[1].substring(0, 5)}`,
      status: apt.appointment_status,
      patientName:
        apt.patients?.users_patients_user_idTousers?.full_name ||
        'Unknown Patient',
      doctorName:
        apt.doctors?.users_doctors_user_idTousers?.full_name ||
        'Unknown Doctor',
      type: 'Consultation',
    }));
  }

  async findOne(id: number) {
    return this.prisma.appointments.findUnique({
      where: { appointment_id: id },
    });
  }

  async update(
    id: number,
    updateAppointmentDto: UpdateAppointmentDto,
    userId: number,
  ) {
    const appointment = await this.prisma.appointments.update({
      where: { appointment_id: id },
      data: {
        ...updateAppointmentDto,
        modified_by: userId,
        modified_at: new Date(),
      },
    });

    if (updateAppointmentDto.appointment_status === 'Checked-In') {
      await this.opdService.createFromAppointment(id, userId);
    }

    return appointment;
  }
}
