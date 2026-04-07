import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdGeneratorService } from '../utils/id-generator.service';
import { EventsGateway } from '../events/events.gateway';
import { BillingService } from '../billing/billing.service';
import { CreateOpdVisitDto } from './dto/create-opd-visit.dto';
import { UpdateOpdVisitDto } from './dto/update-opd-visit.dto';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { AddTestDto } from './dto/add-test.dto';
import { AddProcedureDto } from './dto/add-procedure.dto';
import { AddPrescriptionDto } from './dto/add-prescription.dto';
import { UpsertVitalsDto } from './dto/upsert-vitals.dto';

@Injectable()
export class OpdService {
  constructor(
    private prisma: PrismaService,
    private idGenerator: IdGeneratorService,
    private eventsGateway: EventsGateway,
    private billingService: BillingService,
  ) { }

  // --- CORE VISITS ---

  async create(dto: CreateOpdVisitDto, userId: number) {
    // 1. Fetch missing details if Appointment ID provided (validation)
    let doctorId = dto.doctor_id;
    if (!doctorId && dto.appointment_id) {
      const apt = await this.prisma.appointments.findUnique({
        where: { appointment_id: dto.appointment_id },
      });
      if (apt) doctorId = apt.doctor_id;
    }

    if (!doctorId) throw new BadRequestException('Doctor ID is required');

    // 1. If appointment exists -> reuse OPD
    if (dto.appointment_id) {
      const existing = await this.prisma.opd_visits.findFirst({
        where: { appointment_id: dto.appointment_id },
      });
      if (existing) return existing;
    }

    // 2. fallback: active visit check
    const existingActive = await this.prisma.opd_visits.findFirst({
      where: {
        hospital_id: dto.hospital_id,
        patient_id: dto.patient_id,
        doctor_id: doctorId,
        NOT: { is_active: false },
      },
    });

    if (existingActive) {
      // Return existing active visit instead of creating a duplicate
      return existingActive;
    }

    // 3. Generate OPD Number
    const opdNo = await this.idGenerator.generateOpdNumber(
      dto.hospital_id,
      userId,
    );

    // 4. Use front-end provided follow-up details (No auto-detect as per requirements)
    const isFollowUp = dto.is_follow_up || false;
    const oldOpdId = dto.old_opd_id || null;

    // 5. Create Visit
    const visit = await this.prisma.opd_visits.create({
      data: {
        hospital_id: dto.hospital_id,
        patient_id: dto.patient_id,
        doctor_id: doctorId,
        appointment_id: dto.appointment_id,
        opd_no: opdNo,
        visit_datetime: new Date(),
        chief_complaint: dto.chief_complaint || '',
        is_follow_up: isFollowUp,
        old_opd_id: oldOpdId,
        created_by: userId,
        modified_by: userId,
      },
    });

    // 6. Broadcast visit created event
    this.eventsGateway.broadcastVisitUpdated(dto.hospital_id, visit.opd_id);

    return visit;
  }

  async createFromAppointment(appointmentId: number, userId: number) {
    const apt = await this.prisma.appointments.findUnique({
      where: { appointment_id: appointmentId },
    });
    if (!apt) throw new NotFoundException('Appointment not found');

    // Check if OPD already exists for this appointment
    const existing = await this.prisma.opd_visits.findFirst({
      where: { appointment_id: appointmentId },
    });
    if (existing) return existing;

    const opdNo = await this.idGenerator.generateOpdNumber(apt.hospital_id);

    const visit = await this.prisma.opd_visits.create({
      data: {
        hospital_id: apt.hospital_id,
        patient_id: apt.patient_id,
        doctor_id: apt.doctor_id,
        appointment_id: apt.appointment_id,
        opd_no: opdNo,
        visit_datetime: new Date(),
        chief_complaint: 'Visit from Appointment',
        created_by: userId,
        modified_by: userId,
      },
    });

    // Broadcast visit created event
    this.eventsGateway.broadcastVisitUpdated(apt.hospital_id, visit.opd_id);

    return visit;
  }

  async findAll(query: any) {
    const { hospital_id, doctor_id, patient_id, date, status, is_active } = query;
    const where: any = {};

    if (hospital_id) where.hospital_id = +hospital_id;
    if (doctor_id) where.doctor_id = +doctor_id;
    if (patient_id) where.patient_id = +patient_id;

    // Status Logic — is_active is Boolean? (nullable), null = active
    if (status === 'Active') where.NOT = { is_active: false };
    if (status === 'Discharged' || status === 'Completed')
      where.is_active = false;

    // Direct is_active filter (from receptionist queue view)
    if (is_active === 'true' || is_active === true) {
      where.NOT = { is_active: false };
    } else if (is_active === 'false' || is_active === false) {
      where.is_active = false;
    }

    if (date) {
      where.visit_datetime = {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      };
    }

    const visits = await this.prisma.opd_visits.findMany({
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
        opd_diagnoses: { include: { diagnoses: true } },
        opd_tests: { include: { tests: true } },
      },
      orderBy: { visit_datetime: 'desc' },
    });

    return visits.map((v) => ({
      ...v,
      opdid: v.opd_id,
      hospitalid: v.hospital_id,
      patientid: v.patient_id,
      doctorid: v.doctor_id,
      opdno: v.opd_no,
      visitdatetime: v.visit_datetime,
      status: v.is_active ? 'Active' : 'Discharged',
      patientName:
        v.patients?.users_patients_user_idTousers?.full_name || 'Unknown',
      doctorName:
        v.doctors?.users_doctors_user_idTousers?.full_name || 'Unknown',
      diagnosis: v.opd_diagnoses?.[0]?.diagnoses?.diagnosis_name || '', // Primary logic can be improved
      notes: v.clinical_notes,
    }));
  }

  async findOne(id: number) {
    return this.prisma.opd_visits.findUnique({
      where: { opd_id: id },
      include: {
        patients: {
          include: {
            users_patients_user_idTousers: { select: { full_name: true } },
          },
        },
        opd_diagnoses: { include: { diagnoses: true } },
        vitals: true,
        opd_tests: { include: { tests: true } },
        opd_procedures: { include: { procedures: true } },
        prescriptions: {
          include: { prescription_items: { include: { medicines: true } } },
        },
      },
    });
  }

  async update(id: number, dto: UpdateOpdVisitDto, userId: number) {
    // Handle Diagnosis Update if provided
    if (dto.diagnosis) {
      let diagnosisMaster = await this.prisma.diagnoses.findFirst({
        where: {
          diagnosis_name: { equals: dto.diagnosis, mode: 'insensitive' },
        },
      });

      if (!diagnosisMaster) {
        diagnosisMaster = await this.prisma.diagnoses.create({
          data: {
            diagnosis_code: `D-${Date.now()}`,
            diagnosis_name: dto.diagnosis,
            department_id: 1,
            description: 'Auto-created from OPD Visit',
          },
        });
      }

      const existingPrimary = await this.prisma.opd_diagnoses.findFirst({
        where: { visit_id: id, is_primary: true },
      });

      if (existingPrimary) {
        await this.prisma.opd_diagnoses.update({
          where: { opd_diagnosis_id: existingPrimary.opd_diagnosis_id },
          data: { diagnosis_id: diagnosisMaster.diagnosis_id },
        });
      } else {
        const existingLink = await this.prisma.opd_diagnoses.findUnique({
          where: {
            visit_id_diagnosis_id: {
              visit_id: id,
              diagnosis_id: diagnosisMaster.diagnosis_id,
            },
          },
        });

        if (existingLink) {
          await this.prisma.opd_diagnoses.update({
            where: { opd_diagnosis_id: existingLink.opd_diagnosis_id },
            data: { is_primary: true },
          });
        } else {
          await this.prisma.opd_diagnoses.create({
            data: {
              visit_id: id,
              diagnosis_id: diagnosisMaster.diagnosis_id,
              is_primary: true,
              remarks: 'Primary Diagnosis',
            },
          });
        }
      }
    }

    const { diagnosis, ...updateData } = dto;

    const updatedOpd = await this.prisma.opd_visits.update({
      where: { opd_id: id },
      data: {
        ...updateData,
        modified_by: userId,
        modified_at: new Date(),
      },
    });

    // ===============================
    // ✅ DISCHARGE FLOW
    // ===============================
    if (updateData.is_active === false) {

      // 1. Find linked token (if any)
      const linkedToken = await this.prisma.queue_tokens.findFirst({
        where: { opd_id: id, status: 'In Progress' },
      });

      // 2. Complete token
      if (linkedToken) {
        await this.prisma.queue_tokens.update({
          where: { token_id: linkedToken.token_id },
          data: {
            status: 'Completed',
            completed_at: new Date(),
          },
        });

        // Broadcast queue update safely
        if (linkedToken.daily_queue_id) {
          const tokenQueue = await this.prisma.daily_queues.findUnique({
            where: { daily_queue_id: linkedToken.daily_queue_id },
          });

          if (tokenQueue?.hospital_id) {
            this.eventsGateway.broadcastQueueUpdate(
              tokenQueue.hospital_id,
              tokenQueue.daily_queue_id
            );
          }
        }
      }

      // 3. COMPLETE APPOINTMENT (single unified logic)
      const appointmentId =
        updatedOpd.appointment_id || linkedToken?.appointment_id;

      if (appointmentId) {
        await this.prisma.appointments.update({
          where: { appointment_id: appointmentId },
          data: {
            appointment_status: 'Completed',
            modified_by: userId,
            modified_at: new Date(),
          },
        });
      }

      // 4. Auto-generate bill
      await this.autoGenerateBill(id, updatedOpd.hospital_id, userId);
    }

    // Broadcast visit update
    this.eventsGateway.broadcastVisitUpdated(
      updatedOpd.hospital_id,
      updatedOpd.opd_id
    );

    return updatedOpd;
  }

  
  // --- CLINICAL ---

  async addDiagnosis(opdId: number, dto: AddDiagnosisDto) {
    return this.prisma.opd_diagnoses.create({
      data: {
        visit_id: opdId,
        diagnosis_id: dto.diagnosis_id,
        is_primary: dto.is_primary || false,
        remarks: dto.remarks,
      },
    });
  }

  async addTest(opdId: number, dto: AddTestDto) {
    // Idempotency: skip if this test already exists for the visit
    const existing = await this.prisma.opd_tests.findFirst({
      where: { visit_id: opdId, test_id: dto.test_id },
    });
    if (existing) return existing;

    return this.prisma.opd_tests.create({
      data: {
        visit_id: opdId,
        test_id: dto.test_id,
        test_status: dto.status || 'Ordered',
      },
    });
  }

  async addProcedure(opdId: number, dto: AddProcedureDto) {
    // Idempotency: skip if this procedure already exists for the visit
    const existing = await this.prisma.opd_procedures.findFirst({
      where: { visit_id: opdId, procedure_id: dto.procedure_id },
    });
    if (existing) return existing;

    return this.prisma.opd_procedures.create({
      data: {
        visit_id: opdId,
        procedure_id: dto.procedure_id,
        procedure_date: new Date(dto.procedure_date),
        remarks: dto.remarks,
      },
    });
  }

  async addPrescription(
    opdId: number,
    dto: AddPrescriptionDto,
    userId: number,
  ) {
    // 1. Create Prescription Header
    // prevent duplicate active prescription
    const existing = await this.prisma.prescriptions.findFirst({
      where: { visit_id: opdId, is_active: true },
    });

    let prescription = existing;

    if (!prescription) {
      // Resolve doctor_id: use dto value, fallback to the visit's own doctor
      let resolvedDoctorId: number | undefined = dto.doctor_id;
      if (!resolvedDoctorId) {
        const visit = await this.prisma.opd_visits.findUnique({
          where: { opd_id: opdId },
          select: { doctor_id: true },
        });
        resolvedDoctorId = visit?.doctor_id;
      }
      if (!resolvedDoctorId) {
        throw new Error('Cannot create prescription: doctor_id is missing and could not be resolved from the visit.');
      }
      const finalDoctorId: number = resolvedDoctorId;

      prescription = await this.prisma.prescriptions.create({
        data: {
          visit_id: opdId,
          doctor_id: finalDoctorId,
          notes: dto.notes,
          created_by: userId,
          is_active: true,
        },
      });
    }

    // 2. Add Items
    if (dto.items && dto.items.length > 0) {
      await this.prisma.prescription_items.createMany({
        data: dto.items.map((item) => ({
          prescription_id: prescription.prescription_id,
          medicine_id: item.medicine_id,
          dosage: item.dosage,
          quantity: item.quantity,
          duration_days: item.duration_days,
          instructions: item.instructions,
        })),
      });
    }

    // 3. Broadcast prescription created event
    const visit = await this.prisma.opd_visits.findUnique({ where: { opd_id: opdId } });
    if (visit) {
      this.eventsGateway.broadcastPrescriptionCreated(visit.hospital_id, opdId);
    }

    return prescription;
  }

  // --- VITALS ---

  async getVitals(opdId: number) {
    const vitals = await this.prisma.vitals.findUnique({
      where: { opd_id: opdId },
    });
    if (!vitals) throw new NotFoundException('Vitals not found for this visit');
    return vitals;
  }

  async upsertVitals(opdId: number, dto: UpsertVitalsDto) {
    const result = await this.prisma.vitals.upsert({
      where: { opd_id: opdId },
      update: {
        ...dto,
        modified_at: new Date(),
      },
      create: {
        opd_id: opdId,
        ...dto,
      },
    });

    // Broadcast vitals recorded event
    const visit = await this.prisma.opd_visits.findUnique({ where: { opd_id: opdId } });
    if (visit) {
      this.eventsGateway.broadcastVitalsRecorded(visit.hospital_id, opdId);
    }

    return result;
  }

  // --- AUTO-BILLING ON DISCHARGE ---

  /**
   * Auto-generates a draft bill when a patient is discharged.
   * Collects: consultation fee + procedures + tests + medicines.
   * Skips bill creation if there are no billable items.
   */
  private async autoGenerateBill(opdId: number, hospitalId: number, userId: number) {
    try {
      // Check if a bill already exists for this visit
      const existingBill = await this.prisma.billing.findFirst({
        where: { visit_id: opdId, NOT: { is_active: false } },
      });
      if (existingBill) return; // Don't create duplicate bills

      // Fetch all billable data in parallel
      const [visit, procedures, tests, prescriptions] = await Promise.all([
        this.prisma.opd_visits.findUnique({
          where: { opd_id: opdId },
          include: {
            doctors: {
              include: { users_doctors_user_idTousers: { select: { full_name: true } } },
            },
          },
        }),
        this.prisma.opd_procedures.findMany({
          where: { visit_id: opdId },
          include: { procedures: true },
        }),
        this.prisma.opd_tests.findMany({
          where: { visit_id: opdId },
          include: { tests: true },
        }),
        this.prisma.prescriptions.findMany({
          where: { visit_id: opdId, NOT: { is_active: false } },
          include: {
            prescription_items: {
              include: { medicines: true },
            },
          },
        }),
      ]);

      if (!visit) return;

      const items: any[] = [];
      let subtotal = 0;

      // 1. Consultation Fee
      const consultationFee = Number(visit.doctors?.consultation_fees || 0);
      if (consultationFee > 0) {
        items.push({
          item_type: 'Consultation',
          reference_id: visit.doctor_id,
          item_description: `Consultation Fee - Dr. ${visit.doctors?.users_doctors_user_idTousers?.full_name || 'Doctor'}`,
          quantity: 1,
          unit_price: consultationFee,
          total_price: consultationFee,
        });
        subtotal += consultationFee;
      }

      // 2. Procedures
      for (const proc of procedures) {
        const price = Number(proc.procedures?.price || 0);
        items.push({
          item_type: 'Procedure',
          reference_id: proc.procedure_id,
          item_description: proc.procedures?.procedure_name || 'Procedure',
          quantity: 1,
          unit_price: price,
          total_price: price,
        });
        subtotal += price;
      }

      // 3. Tests
      for (const test of tests) {
        const price = Number(test.tests?.price || 0);
        items.push({
          item_type: 'Test',
          reference_id: test.test_id,
          item_description: test.tests?.test_name || 'Test',
          quantity: 1,
          unit_price: price,
          total_price: price,
        });
        subtotal += price;
      }

      // 4. Medicines excluded from auto-bill (will be added by Pharmacy on dispense)

      // Skip if nothing to bill
      if (items.length === 0) return;

      // Create bill via BillingService
      const bill = await this.billingService.create(
        {
          hospital_id: hospitalId,
          visit_id: opdId,
          subtotal_amount: subtotal,
          tax_amount: 0,
          discount_amount: 0,
          items,
        },
        userId,
      );

      // Broadcast bill created event
      this.eventsGateway.broadcastBillCreated(hospitalId, bill.bill_id, opdId);
    } catch (error) {
      // Log but don't fail the discharge if billing fails
      console.error(`Auto-bill generation failed for OPD ${opdId}:`, error.message);
    }
  }
}
