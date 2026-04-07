import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Helper: build the UTC full-day range for a DATE column filter
function utcDayRange(dateStr: string) {
  return {
    gte: new Date(`${dateStr}T00:00:00.000Z`),
    lte: new Date(`${dateStr}T23:59:59.999Z`),
  };
}

/**
 * Extract first name only from a full name string.
 * Security: we never expose full patient names on the public display.
 */
function firstNameOnly(fullName: string | null | undefined): string {
  if (!fullName) return 'Patient';
  const first = fullName.trim().split(/\s+/)[0];
  return first || 'Patient';
}

@Injectable()
export class PublicDisplayService {
  private readonly logger = new Logger(PublicDisplayService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * GET /public/queue-display
   *
   * Returns sanitized, read-only queue data for the TV display.
   * Only exposes: doctor_name, token_number, patient first name.
   * NO phone numbers, NO medical data, NO patient full details.
   */
  async getQueueDisplay(hospitalId?: number, doctorId?: number) {
    const today = new Date().toISOString().split('T')[0];

    // Build filter
    const where: any = {
      status: 'Active',
      queue_date: utcDayRange(today),
    };

    if (hospitalId) where.hospital_id = +hospitalId;
    if (doctorId) where.doctor_id = +doctorId;

    // Fetch all active queues for today with their tokens
    const queues = await this.prisma.daily_queues.findMany({
      where,
      include: {
        doctors: {
          include: {
            users_doctors_user_idTousers: {
              select: { full_name: true },
            },
          },
        },
        queue_tokens: {
          where: {
            status: { in: ['Waiting', 'In Progress'] },
          },
          include: {
            opd_visits: {
              include: {
                patients: {
                  include: {
                    users_patients_user_idTousers: {
                      select: { full_name: true },
                    },
                  },
                },
              },
            },
            appointments: {
              include: {
                patients: {
                  include: {
                    users_patients_user_idTousers: {
                      select: { full_name: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: [
            { status: 'asc' }, // "In Progress" before "Waiting" (alphabetically)
            { token_number: 'asc' },
          ],
        },
      },
      orderBy: { doctor_id: 'asc' },
    });

    // Transform into the public-safe response format
    const doctors = queues.map((queue) => {
      const doctorName =
        queue.doctors?.users_doctors_user_idTousers?.full_name || 'Doctor';

      // Resolve patient name from either OPD visit or appointment
      const resolvePatientName = (token: any): string => {
        // Try OPD visit patient first
        const opdPatientName =
          token.opd_visits?.patients?.users_patients_user_idTousers?.full_name;
        if (opdPatientName) return firstNameOnly(opdPatientName);

        // Try appointment patient
        const apptPatientName =
          token.appointments?.patients?.users_patients_user_idTousers
            ?.full_name;
        if (apptPatientName) return firstNameOnly(apptPatientName);

        return 'Patient';
      };

      // Find the current "In Progress" token
      const inProgressToken = queue.queue_tokens.find(
        (t) => t.status === 'In Progress',
      );

      // Get waiting tokens (next in line)
      const waitingTokens = queue.queue_tokens
        .filter((t) => t.status === 'Waiting')
        .slice(0, 3); // Show only next 3

      return {
        doctor_id: queue.doctor_id,
        doctor_name: doctorName,
        current: inProgressToken
          ? {
              token_number: inProgressToken.token_number,
              patient_name: resolvePatientName(inProgressToken),
            }
          : null,
        next: waitingTokens.map((t) => ({
          token_number: t.token_number,
          patient_name: resolvePatientName(t),
        })),
      };
    });

    return { doctors };
  }
}
