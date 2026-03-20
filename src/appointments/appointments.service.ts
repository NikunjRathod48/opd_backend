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

  async create(createAppointmentDto: CreateAppointmentDto, userId: number) {
    const appointmentNo = await this.idGenerator.generateAppointmentNumber(
      createAppointmentDto.hospital_id,
      userId,
    );

    return this.prisma.appointments.create({
      data: {
        hospital_id: createAppointmentDto.hospital_id,
        patient_id: createAppointmentDto.patient_id,
        doctor_id: createAppointmentDto.doctor_id,
        appointment_no: appointmentNo,
        appointment_date: new Date(createAppointmentDto.appointment_date),
        appointment_time: new Date(
          `${createAppointmentDto.appointment_date}T${createAppointmentDto.appointment_time}`,
        ),
        appointment_status: 'Scheduled',
        remarks: createAppointmentDto.remarks,
        created_by: userId,
        modified_by: userId,
      },
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
