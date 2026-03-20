import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

// Only values the DB check constraint allows
const VALID_TOKEN_STATUSES = [
  'Waiting',
  'In Progress',
  'Completed',
  'Skipped',
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
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) { }

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

  async generateToken(queueId: number, opdId?: number | null) {
    return this.prisma.$transaction(async (tx) => {
      const queue = await tx.daily_queues.findUnique({
        where: { daily_queue_id: queueId },
      });
      if (!queue) throw new NotFoundException('Queue not found');
      if (queue.status !== 'Active')
        throw new BadRequestException('Queue is not active');

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
          status: 'Waiting',
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
      },
      orderBy: { token_number: 'asc' },
    });
  }

  async updateTokenStatus(tokenId: number, status: string) {
    if (!VALID_TOKEN_STATUSES.includes(status as any)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${VALID_TOKEN_STATUSES.join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.queue_tokens.findUnique({
        where: { token_id: tokenId },
        include: { daily_queues: true },
      });
      if (!token) throw new NotFoundException('Token not found');

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

      const data: any = { status };
      if (status === 'In Progress') data.started_at = new Date();
      if (status === 'Completed' || status === 'Skipped')
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
      }

      this.eventsGateway.broadcastQueueUpdate(token.daily_queues.hospital_id, token.daily_queue_id);
      return updated;
    });
  }
}
