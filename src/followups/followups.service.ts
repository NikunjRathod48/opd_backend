import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFollowupDto, UpdateFollowupDto } from './dto/followup.dto';

@Injectable()
export class FollowupsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new follow-up recommendation for an OPD visit.
   */
  async create(dto: CreateFollowupDto) {
    // Validate visit exists
    const visit = await this.prisma.opd_visits.findUnique({
      where: { opd_id: dto.visit_id },
    });
    if (!visit) throw new NotFoundException('OPD visit not found');

    return this.prisma.followups.create({
      data: {
        visit_id: dto.visit_id,
        recommended_date: new Date(dto.recommended_date),
        reason: dto.reason,
        status: dto.status || 'Pending',
      },
    });
  }

  /**
   * Get all follow-ups for a specific OPD visit.
   */
  async findByVisit(visitId: number) {
    return this.prisma.followups.findMany({
      where: { visit_id: visitId },
      orderBy: { recommended_date: 'asc' },
    });
  }

  /**
   * Get all follow-ups with optional filters (hospital-wide view).
   * Supports: status, date range, hospital_id
   */
  async findAll(query: {
    hospital_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
  }) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.from_date || query.to_date) {
      where.recommended_date = {};
      if (query.from_date) where.recommended_date.gte = new Date(query.from_date);
      if (query.to_date) where.recommended_date.lte = new Date(query.to_date);
    }

    if (query.hospital_id) {
      where.opd_visits = { hospital_id: Number(query.hospital_id) };
    }

    return this.prisma.followups.findMany({
      where,
      include: {
        opd_visits: {
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
        },
      },
      orderBy: { recommended_date: 'asc' },
    });
  }

  /**
   * Update a follow-up (change status, reschedule, edit reason).
   */
  async update(id: number, dto: UpdateFollowupDto) {
    const existing = await this.prisma.followups.findUnique({
      where: { followup_id: id },
    });
    if (!existing) throw new NotFoundException('Follow-up not found');

    return this.prisma.followups.update({
      where: { followup_id: id },
      data: {
        ...dto,
        recommended_date: dto.recommended_date
          ? new Date(dto.recommended_date)
          : undefined,
        modified_at: new Date(),
      },
    });
  }

  /**
   * Get a single follow-up by ID.
   */
  async findOne(id: number) {
    const followup = await this.prisma.followups.findUnique({
      where: { followup_id: id },
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
    });
    if (!followup) throw new NotFoundException('Follow-up not found');
    return followup;
  }
}
