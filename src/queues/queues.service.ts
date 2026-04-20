import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

import { IdGeneratorService } from '../utils/id-generator.service';

// Only values the DB check constraint allows
const VALID_TOKEN_STATUSES = [
  'Waiting',
  'In Progress',
  'Completed',
  'Skipped',
  'Return'
] as const;
const VALID_QUEUE_STATUSES = ['Active', 'Closed'] as const; // schema: CHECK (status IN ('Active','Closed'))

// Helper: build the UTC full-day range for a DATE column filter
// Prisma formats @db.Date values as date strings, so both gte/lte resolve to the same date string,
// which is equivalent to exact equality but more robust across Prisma versions.
function utcDayRange(dateStr: string) {
  return {
    gte: new Date(`${dateStr}T00:00:00.000Z`),
    lte: new Date(`${dateStr}T23:59:59.999Z`),
  };
}

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private idGenerator: IdGeneratorService,
  ) { }

  // ─── CRON: Auto-create daily queues at 8 AM ──────────────────────────────
  @Cron('0 8 * * *')
  async autoCreateDailyQueues() {
    this.logger.log('⏰ Running auto-create daily queues cron...');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // DB stores day_of_week as 1-7 (Sun=1, Mon=2, ..., Sat=7)
    // JS getDay() returns 0-6 (Sun=0, Mon=1, ..., Sat=6) → add 1
    const dayOfWeek = today.getDay() + 1;

    // 1. Find all doctors available TODAY (matching day_of_week)
    const availableSlots = await this.prisma.doctor_availability.findMany({
      where: {
        day_of_week: dayOfWeek,
        is_available: true,
      },
      include: {
        doctors: true, // need hospital_id from doctors table
      },
    });

    let created = 0;
    let reopened = 0;
    const now = new Date();

    for (const slot of availableSlots) {
      // 2. Check if queue already exists for this doctor today
      const existing = await this.prisma.daily_queues.findFirst({
        where: {
          hospital_id: slot.doctors.hospital_id,
          doctor_id: slot.doctor_id,
          queue_date: utcDayRange(todayStr),
        },
      });

      if (!existing) {
        // No queue at all → create fresh
        await this.prisma.daily_queues.create({
          data: {
            hospital_id: slot.doctors.hospital_id,
            doctor_id: slot.doctor_id,
            queue_date: new Date(`${todayStr}T00:00:00.000Z`),
            current_token: 0,
            status: 'Active',
            created_by: 1, // system user
            modified_by: 1,
          },
        });
        created++;
      } else if (existing.status === 'Closed') {
        // Queue was closed — check if we're still within the availability window
        // DB times are local (IST), so compare with local time
        const startMinutes = slot.start_time.getUTCHours() * 60 + slot.start_time.getUTCMinutes();
        const endMinutes = slot.end_time.getUTCHours() * 60 + slot.end_time.getUTCMinutes();
        const nowMinutes = now.getHours() * 60 + now.getMinutes(); // LOCAL time

        if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
          // Still within working hours → reopen the queue
          await this.prisma.daily_queues.update({
            where: { daily_queue_id: existing.daily_queue_id },
            data: {
              status: 'Active',
              closed_at: null,
              modified_by: 1,
            },
          });
          this.eventsGateway.broadcastQueueUpdate(existing.hospital_id, existing.daily_queue_id);
          reopened++;
          this.logger.log(`Reopened closed queue ${existing.daily_queue_id} for doctor ${slot.doctor_id}`);
        }
      }
      // If Active → do nothing (already open)
    }
    this.logger.log(`Auto-queue: created=${created}, reopened=${reopened} (${availableSlots.length} doctors available, day=${dayOfWeek})`);
  }

  // ─── Close stale queues from previous days ──────────────────────────────
  // Handles the case where the service was asleep (e.g. Render free tier)
  // and missed the 5-min auto-close window for a previous day's queues.
  async closeStaleQueues() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayUtcStr = todayStart.toISOString().split('T')[0];

    // Find all Active queues whose queue_date is BEFORE today
    const staleQueues = await this.prisma.daily_queues.findMany({
      where: {
        status: 'Active',
        queue_date: {
          lt: new Date(`${todayUtcStr}T00:00:00.000Z`),
        },
      },
    });

    if (staleQueues.length === 0) return;

    this.logger.warn(
      `🧹 Found ${staleQueues.length} stale Active queue(s) from previous days — closing them now.`,
    );

    for (const queue of staleQueues) {
      await this.prisma.daily_queues.update({
        where: { daily_queue_id: queue.daily_queue_id },
        data: {
          status: 'Closed',
          closed_at: new Date(),
          modified_by: 1, // system user
        },
      });
      this.eventsGateway.broadcastQueueUpdate(queue.hospital_id, queue.daily_queue_id);
      this.logger.log(
        `🧹 Closed stale queue ${queue.daily_queue_id} (doctor ${queue.doctor_id}, date ${queue.queue_date})`,
      );
    }

    this.logger.log(`🧹 Closed ${staleQueues.length} stale queue(s) total.`);
  }

  // ─── CRON: Auto-close queues after doctor's end_time ────────────────────
  @Cron('*/5 * * * *') // every 5 minutes
  async autoCloseDailyQueues() {
    // 0. First, close any stale queues from previous days (missed due to downtime)
    await this.closeStaleQueues();

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay() + 1; // 1=Sun ... 7=Sat

    // 1. Find all Active queues for today
    const activeQueues = await this.prisma.daily_queues.findMany({
      where: {
        status: 'Active',
        queue_date: utcDayRange(todayStr),
      },
    });

    if (activeQueues.length === 0) return;

    let closed = 0;
    for (const queue of activeQueues) {
      // 2. Find this doctor's availability slot for today
      const availability = await this.prisma.doctor_availability.findFirst({
        where: {
          doctor_id: queue.doctor_id,
          day_of_week: dayOfWeek,
          is_available: true,
        },
      });

      if (!availability) continue; // manually opened queue (no schedule) — don't auto-close

      // 3. Compare current LOCAL time with end_time
      // PostgreSQL TIME fields store values WITHOUT timezone.
      // The admin enters times in local time (e.g. 12:09 PM IST).
      // Prisma reads them as Date objects — getUTCHours() returns the raw stored value (12).
      // So we compare DB time (via getUTCHours) with current LOCAL time (via getHours).
      const endHour = availability.end_time.getUTCHours();
      const endMinute = availability.end_time.getUTCMinutes();
      const currentHour = now.getHours();   // LOCAL time
      const currentMinute = now.getMinutes(); // LOCAL time

      const endTotalMinutes = endHour * 60 + endMinute;
      const currentTotalMinutes = currentHour * 60 + currentMinute;

      this.logger.log(
        `[AutoClose] Queue ${queue.daily_queue_id} | Doctor ${queue.doctor_id} | ` +
        `end=${endHour}:${String(endMinute).padStart(2, '0')} | ` +
        `now=${currentHour}:${String(currentMinute).padStart(2, '0')} | ` +
        `shouldClose=${currentTotalMinutes >= endTotalMinutes}`
      );

      if (currentTotalMinutes >= endTotalMinutes) {
        // 4. Auto-close the queue
        await this.prisma.daily_queues.update({
          where: { daily_queue_id: queue.daily_queue_id },
          data: {
            status: 'Closed',
            closed_at: new Date(),
            modified_by: 1, // system user
          },
        });

        this.eventsGateway.broadcastQueueUpdate(queue.hospital_id, queue.daily_queue_id);
        closed++;
        this.logger.log(`Auto-closed queue ${queue.daily_queue_id} for doctor ${queue.doctor_id}`);
      }
    }

    if (closed > 0) {
      this.logger.log(`🔒 Auto-closed ${closed} queues`);
    }
  }
  // ─── FALLBACK: Ensure queue exists before any token operation ────────────
  async ensureQueueExists(hospitalId: number, doctorId: number, userId: number = 1) {
    const today = new Date().toISOString().split('T')[0];

    let queue = await this.prisma.daily_queues.findFirst({
      where: {
        hospital_id: hospitalId,
        doctor_id: doctorId,
        queue_date: utcDayRange(today),
      },
      include: {
        doctors: {
          include: {
            users_doctors_user_idTousers: { select: { full_name: true } },
          },
        },
        _count: { select: { queue_tokens: true } },
      },
    });

    if (!queue) {
      queue = await this.prisma.daily_queues.create({
        data: {
          hospital_id: hospitalId,
          doctor_id: doctorId,
          queue_date: new Date(`${today}T00:00:00.000Z`),
          current_token: 0,
          status: 'Active',
          created_by: userId,
          modified_by: userId,
        },
        include: {
          doctors: {
            include: {
              users_doctors_user_idTousers: { select: { full_name: true } },
            },
          },
          _count: { select: { queue_tokens: true } },
        },
      });
      this.logger.log(`⚡ Auto-created queue on demand for doctor ${doctorId}`);
    }

    return queue;
  }

  async createQueue(
    hospitalId: number,
    doctorId: number,
    queueDate: string,
    userId: number,
  ) {
    // DB already enforces UNIQUE (hospital_id, doctor_id, queue_date),
    // but we check first to return a friendly error instead of a Prisma constraint error.
    const existing = await this.prisma.daily_queues.findFirst({
      where: {
        hospital_id: hospitalId,
        doctor_id: doctorId,
        queue_date: utcDayRange(queueDate),
      },
    });

    if (existing) {
      throw new BadRequestException(
        'A queue already exists for this doctor on this date',
      );
    }

    return this.prisma.daily_queues.create({
      data: {
        hospital_id: hospitalId,
        doctor_id: doctorId,
        queue_date: new Date(`${queueDate}T00:00:00.000Z`),
        current_token: 0,
        status: 'Active',
        created_by: userId,
        modified_by: userId,
      },
      include: {
        doctors: {
          include: {
            users_doctors_user_idTousers: { select: { full_name: true } },
          },
        },
        _count: { select: { queue_tokens: true } },
      },
    });
  }

  async findAllQueues(query: any) {
    const { hospital_id, doctor_id, user_id, date, status } = query;
    const where: any = {};

    if (hospital_id) where.hospital_id = +hospital_id;
    if (status && VALID_QUEUE_STATUSES.includes(status)) where.status = status;

    if (doctor_id) {
      // Explicit doctor filter (doctor fetching their own queue)
      where.doctor_id = +doctor_id;
    } else if (user_id) {
      // Try to resolve to a doctor record (for Doctor role users)
      // If the user is a Receptionist or other role, no doctor record will exist
      // — in that case we simply omit the doctor filter so ALL queues for the hospital are returned.
      const doctor = await this.prisma.doctors.findFirst({
        where: { user_id: +user_id },
      });
      if (doctor) where.doctor_id = doctor.doctor_id;
      // else: receptionist/admin — skip doctor filter, return all queues for the hospital
    }

    if (date) {
      where.queue_date = utcDayRange(date);
    }

    return this.prisma.daily_queues.findMany({
      where,
      include: {
        doctors: {
          include: {
            users_doctors_user_idTousers: { select: { full_name: true } },
          },
        },
        _count: { select: { queue_tokens: true } },
      },
      orderBy: { queue_date: 'desc' },
    });
  }

  async updateQueueStatus(queueId: number, status: string, userId: number) {
    if (!VALID_QUEUE_STATUSES.includes(status as any)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${VALID_QUEUE_STATUSES.join(', ')}`,
      );
    }

    const data: any = { status, modified_by: userId };
    if (status === 'Closed') data.closed_at = new Date();
    if (status === 'Active') data.closed_at = null; // clear on reopen

    const updatedQueue = await this.prisma.daily_queues.update({
      where: { daily_queue_id: queueId },
      data,
      include: {
        doctors: {
          include: {
            users_doctors_user_idTousers: { select: { full_name: true } },
          },
        },
        _count: { select: { queue_tokens: true } },
      },
    });

    this.eventsGateway.broadcastQueueUpdate(updatedQueue.hospital_id, updatedQueue.daily_queue_id);
    return updatedQueue;
  }

  async linkTokenToOpd(tokenId: number, opdId: number) {
    const token = await this.prisma.queue_tokens.findUnique({
      where: { token_id: tokenId },
      include: { daily_queues: true },
    });
    if (!token) throw new NotFoundException('Token not found');
    const updated = await this.prisma.queue_tokens.update({
      where: { token_id: tokenId },
      data: { opd_id: opdId },
    });
    this.eventsGateway.broadcastQueueUpdate(token.daily_queues.hospital_id, token.daily_queue_id);
    return updated;
  }

  async generateToken(queueId: number, opdId?: number | null, priority?: string, status?: string, appointmentId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const queue = await tx.daily_queues.findUnique({
        where: { daily_queue_id: queueId },
      });
      if (!queue) throw new NotFoundException('Queue not found');
      if (queue.status !== 'Active')
        throw new BadRequestException('Queue is not active');

      // 🛡️ Prevent duplicate active tokens for the same patient in same queue
      if (opdId || appointmentId) {
        const duplicateWhere: any = {
          daily_queue_id: queueId,
          status: { in: ['Waiting', 'In Progress'] },
        };
        if (opdId) duplicateWhere.opd_id = opdId;
        if (appointmentId) duplicateWhere.appointment_id = appointmentId;

        const existingActive = await tx.queue_tokens.findFirst({
          where: duplicateWhere,
        });

        if (existingActive) {
          throw new BadRequestException(
            'This patient already has an active token in this queue.',
          );
        }
      }

      const maxToken = await tx.queue_tokens.aggregate({
        where: { daily_queue_id: queueId },
        _max: { token_number: true },
      });
      const nextTokenNumber = (maxToken._max.token_number ?? 0) + 1;

      const newToken = await tx.queue_tokens.create({
        data: {
          daily_queue_id: queueId,
          token_number: nextTokenNumber,
          opd_id: opdId ?? null,
          appointment_id: appointmentId ?? null,
          status: status || 'Waiting',
          visit_type: appointmentId ? 'Appointment' : 'Walk_In',
          priority: priority || 'Normal',
        },
      });

      this.eventsGateway.broadcastQueueUpdate(queue.hospital_id, queueId);
      return newToken;
    });
  }

  async getTokensForQueue(queueId: number) {
    return this.prisma.queue_tokens.findMany({
      where: { daily_queue_id: queueId },
      include: {
        opd_visits: {
          include: {
            patients: {
              include: {
                users_patients_user_idTousers: { select: { full_name: true } },
              },
            },
          },
        },
        appointments: {
          include: {
            patients: {
              include: {
                users_patients_user_idTousers: { select: { full_name: true } },
              },
            },
          },
        },
      },
      orderBy: { token_number: 'asc' },
    });
  }

  async updateTokenStatus(tokenId: number, status: string, userId: number = 1) {
    if (!VALID_TOKEN_STATUSES.includes(status as any)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${VALID_TOKEN_STATUSES.join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {

      // Pre-fetch token to see if we need an OPD Number
      const token = await tx.queue_tokens.findUnique({
        where: { token_id: tokenId },
        include: {
          daily_queues: true,
          appointments: true
        },
      });
      if (!token) throw new NotFoundException('Token not found');

      let appointmentDetails: any = null;
      let newOpdNo: string | null = null;

      if (status === 'In Progress' && !token.opd_id && token.appointment_id && token.appointments) {
        appointmentDetails = token.appointments;
        newOpdNo = await this.idGenerator.generateOpdNumber(
          appointmentDetails.hospital_id,
          userId
        );
      }

      // Only one token can be In Progress at a time
      if (status === 'In Progress') {
        const alreadyInProgress = await tx.queue_tokens.findFirst({
          where: {
            daily_queue_id: token.daily_queue_id,
            status: 'In Progress',
          },
        });
        if (alreadyInProgress) {
          throw new BadRequestException(
            'Another token is already In Progress. Complete or skip it first.',
          );
        }
      }

      let finalOpdId = token.opd_id;

      if (status === 'In Progress' && !finalOpdId && token.appointment_id && appointmentDetails) {

        // 🔥 FIRST: check existing OPD
        const existingOpd = await tx.opd_visits.findFirst({
          where: { appointment_id: token.appointment_id },
        });

        if (existingOpd) {
          finalOpdId = existingOpd.opd_id;
        } else {
          if (!newOpdNo) {
            throw new BadRequestException('OPD number generation failed');
          }
          const newOpd = await tx.opd_visits.create({
            data: {
              hospital_id: appointmentDetails.hospital_id,
              patient_id: appointmentDetails.patient_id,
              doctor_id: appointmentDetails.doctor_id,
              appointment_id: token.appointment_id,
              opd_no: newOpdNo,
              visit_datetime: new Date(),
              chief_complaint: 'Visit from Appointment',
              is_active: true,
              created_by: userId,
              modified_by: userId
            }
          });
          finalOpdId = newOpd.opd_id;
        }
      }

      // If token has no OPD and no appointment (e.g. emergency walk-in),
      // we do NOT auto-create a dummy patient. The doctor must register the
      // patient via the StartConsultation sheet on the frontend, which will
      // call linkTokenToOpd() after creating a real patient + OPD.

      const data: any = { status };
      if (status === 'In Progress') {
        data.started_at = new Date();
        if (finalOpdId !== token.opd_id) {
          data.opd_id = finalOpdId;
        }
      }
      if (status === 'Completed' || status === 'Skipped')
        // IMPORTANT:
        // "Completed" here = queue completed (NOT OPD discharge)
        // OPD remains active until doctor manually discharges
        data.completed_at = new Date();

      const updated = await tx.queue_tokens.update({
        where: { token_id: tokenId },
        data,
      });

      if (status === 'In Progress') {
        await tx.daily_queues.update({
          where: { daily_queue_id: token.daily_queue_id },
          data: { current_token: updated.token_number },
        });

        if (token.appointment_id) {
          await tx.appointments.update({
            where: { appointment_id: token.appointment_id },
            data: { appointment_status: 'Checked-In' }
          });
        }
      } else if (status === 'Skipped') {
        if (token.appointment_id) {
          await tx.appointments.update({
            where: { appointment_id: token.appointment_id },
            data: { appointment_status: 'No-Show' }
          });
        }
      }

      this.eventsGateway.broadcastQueueUpdate(token.daily_queues.hospital_id, token.daily_queue_id);

      // 🔊 Emit dedicated event for TV display voice announcements
      if (status === 'In Progress') {
        // Resolve patient name from OPD or appointment
        let patientFullName: string | null = null;

        if (finalOpdId) {
          const opd = await tx.opd_visits.findUnique({
            where: { opd_id: finalOpdId },
            include: {
              patients: {
                include: {
                  users_patients_user_idTousers: { select: { full_name: true } },
                },
              },
            },
          });
          patientFullName = opd?.patients?.users_patients_user_idTousers?.full_name ?? null;
        } else if (token.appointment_id) {
          const appt = await tx.appointments.findUnique({
            where: { appointment_id: token.appointment_id },
            include: {
              patients: {
                include: {
                  users_patients_user_idTousers: { select: { full_name: true } },
                },
              },
            },
          });
          patientFullName = appt?.patients?.users_patients_user_idTousers?.full_name ?? null;
        }

        // Get doctor name
        const doctor = await tx.doctors.findUnique({
          where: { doctor_id: token.daily_queues.doctor_id },
          include: {
            users_doctors_user_idTousers: { select: { full_name: true } },
          },
        });
        const doctorName = doctor?.users_doctors_user_idTousers?.full_name || 'Doctor';

        // Only expose first name for privacy on public display
        const firstName = patientFullName
          ? patientFullName.trim().split(/\s+/)[0]
          : 'Patient';

        this.eventsGateway.broadcastTokenStatusChange(
          token.daily_queues.hospital_id,
          {
            token_number: updated.token_number,
            patient_name: firstName,
            doctor_name: doctorName,
            doctor_id: token.daily_queues.doctor_id,
            status: 'In Progress',
          },
        );
      }

      return updated;
    });
  }

  async generateReturnToken(opdId: number) {
    return this.prisma.$transaction(async (tx) => {

      // 1. Get OPD
      const opd = await tx.opd_visits.findUnique({
        where: { opd_id: opdId },
      });

      if (!opd) throw new NotFoundException('OPD not found');

      // 2. Find today's active queue for doctor
      const today = new Date().toISOString().split('T')[0];

      const queue = await tx.daily_queues.findFirst({
        where: {
          doctor_id: opd.doctor_id,
          hospital_id: opd.hospital_id,
          queue_date: utcDayRange(today),
          status: 'Active',
        },
      });

      if (!queue) {
        throw new BadRequestException('No active queue found for today');
      }

      // 3. Prevent duplicate return token
      const existing = await tx.queue_tokens.findFirst({
        where: {
          opd_id: opdId,
          daily_queue_id: queue.daily_queue_id,
          status: { in: ['Waiting', 'In Progress'] },
        },
      });

      if (existing) {
        throw new BadRequestException('Return token already exists');
      }

      // 4. Get next token number
      const maxToken = await tx.queue_tokens.aggregate({
        where: { daily_queue_id: queue.daily_queue_id },
        _max: { token_number: true },
      });

      const nextTokenNumber = (maxToken._max.token_number ?? 0) + 1;

      // 5. Create RETURN token
      const token = await tx.queue_tokens.create({
        data: {
          daily_queue_id: queue.daily_queue_id,
          token_number: nextTokenNumber,
          opd_id: opdId,
          status: 'Waiting',
          priority: 'Normal',
          visit_type: 'Return', // 🔥 IMPORTANT
        },
      });

      this.eventsGateway.broadcastQueueUpdate(
        queue.hospital_id,
        queue.daily_queue_id
      );

      return token;
    });
  }

  // ─── On Application Bootstrap: cleanup stale + ensure today's queues ────
  async onModuleInit() {
    this.logger.log('🚀 QueuesService init — cleaning up stale queues & ensuring daily queues exist...');
    await this.closeStaleQueues();       // close any leftover queues from previous days
    await this.autoCreateDailyQueues();  // create/reopen today's queues
  }
}
