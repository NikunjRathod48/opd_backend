import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { IdGeneratorService } from '../utils/id-generator.service';
import { OpdService } from '../opd/opd.service';
import { QueuesService } from '../queues/queues.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private idGenerator: IdGeneratorService,
    @Inject(forwardRef(() => OpdService))
    private opdService: OpdService,
    private queuesService: QueuesService,
  ) { }

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
    const capacityPerSlot = 1;

    const startHour = availability.start_time.getUTCHours();
    const startMin = availability.start_time.getUTCMinutes();
    const endHour = availability.end_time.getUTCHours();
    const endMin = availability.end_time.getUTCMinutes();

    const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    const maxAppointments = availability.max_appointments || 1;
    const slotDuration = Math.max(1, Math.floor(totalMinutes / maxAppointments));

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

      current = new Date(current.getTime() + slotDuration * 60000);
    }

    if (slots.length > maxAppointments) {
      slots.length = maxAppointments;
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
    const appointmentTime = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    const dayOfWeek = appointmentDate.getUTCDay() + 1;
    const availability = await this.prisma.doctor_availability.findFirst({
      where: {
        doctor_id: createAppointmentDto.doctor_id,
        day_of_week: dayOfWeek,
        is_available: true,
      },
    });

    if (!availability) {
      throw new Error('Doctor is not available on this date.');
    }

    const capacityPerSlot = 1;

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

      // Queue Generation removed from here. Handled during Check-In.

      return appointment;
    });
  }

  async checkInAppointment(appointmentId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch appointment
      const appointment = await tx.appointments.findUnique({
        where: { appointment_id: appointmentId },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // 2. Validate appointment is for TODAY
      const today = new Date();
      const isToday =
        appointment.appointment_date.getUTCFullYear() === today.getUTCFullYear() &&
        appointment.appointment_date.getUTCMonth() === today.getUTCMonth() &&
        appointment.appointment_date.getUTCDate() === today.getUTCDate();

      if (!isToday) {
        throw new Error('You can only check-in for appointments scheduled for today.');
      }

      // 3. Validate appointment not already checked-in
      if (appointment.appointment_status === 'Checked-In') {
        const existingToken = await tx.queue_tokens.findFirst({
          where: { appointment_id: appointmentId },
        });
        if (existingToken) {
          return existingToken;
        }
      }

      if (['Cancelled', 'No-Show', 'Completed'].includes(appointment.appointment_status)) {
        throw new Error(`Cannot check-in. Appointment is ${appointment.appointment_status}.`);
      }

      // 4. ⏰ Time-aware priority calculation
      // appointment_time is stored as TIME (no timezone) in local time
      // Prisma reads it as Date — getUTCHours() gives the raw stored local hour
      const apptHour = appointment.appointment_time.getUTCHours();
      const apptMinute = appointment.appointment_time.getUTCMinutes();
      const nowHour = today.getHours();    // LOCAL time
      const nowMinute = today.getMinutes(); // LOCAL time

      const apptTotalMinutes = apptHour * 60 + apptMinute;
      const nowTotalMinutes = nowHour * 60 + nowMinute;

      const EARLY_BUFFER_MIN = 60;  // 1 hour before appointment
      const LATE_BUFFER_MIN = 30;   // 30 min grace after appointment

      let priority = 'Normal'; // default: treated like walk-in

      if (
        nowTotalMinutes >= (apptTotalMinutes - EARLY_BUFFER_MIN) &&
        nowTotalMinutes <= (apptTotalMinutes + LATE_BUFFER_MIN)
      ) {
        priority = 'Medium'; // ✅ Valid check-in window → appointment priority
      }
      // else: too early or too late → stays Normal (no unfair advantage)

      // 5. Ensure today's queue exists (auto-create if needed via fallback)
      const dailyQueue = await this.queuesService.ensureQueueExists(
        appointment.hospital_id,
        appointment.doctor_id,
        userId,
      );

      // 6. Prevent duplicate active token for same appointment in this queue
      const existingActive = await tx.queue_tokens.findFirst({
        where: {
          daily_queue_id: dailyQueue.daily_queue_id,
          appointment_id: appointmentId,
          status: { in: ['Waiting', 'In Progress'] },
        },
      });

      if (existingActive) {
        throw new Error('This patient already has an active token in this queue.');
      }

      // 7. Generate token with computed priority
      const maxToken = await tx.queue_tokens.aggregate({
        where: { daily_queue_id: dailyQueue.daily_queue_id },
        _max: { token_number: true },
      });
      const nextTokenNumber = (maxToken._max.token_number ?? 0) + 1;

      const newToken = await tx.queue_tokens.create({
        data: {
          daily_queue_id: dailyQueue.daily_queue_id,
          token_number: nextTokenNumber,
          status: 'Waiting',
          visit_type: 'Appointment',
          priority,
          appointment_id: appointment.appointment_id,
        },
      });

      // 8. Update appointment status
      await tx.appointments.update({
        where: { appointment_id: appointmentId },
        data: {
          appointment_status: 'Checked-In',
          modified_by: userId,
          modified_at: new Date(),
        },
      });

      // 9. Return token
      return newToken;
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
        queue_tokens: {
          select: { token_number: true },
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
      token_number: apt.queue_tokens?.[0]?.token_number, // Extract the token number if available
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
