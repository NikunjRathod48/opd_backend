import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpdTestDto } from './dto/create-opd-test.dto';

@Injectable()
export class OpdTestsService {
  constructor(private prisma: PrismaService) {}

  async create(createOpdTestDto: CreateOpdTestDto) {
    const { visit_id, tests } = createOpdTestDto;

    const visit = await this.prisma.opd_visits.findUnique({
      where: { opd_id: visit_id },
    });

    if (!visit) {
      throw new NotFoundException(`OPD Visit with ID ${visit_id} not found`);
    }

    // Clear existing tests for this visit
    await this.prisma.opd_tests.deleteMany({
      where: { visit_id },
    });

    // Bulk create tests
    return this.prisma.$transaction(
      tests.map((test) =>
        this.prisma.opd_tests.create({
          data: {
            visit_id,
            test_id: test.test_id,
            test_status: test.test_status || 'Ordered',
            result_summary: test.result_summary,
          },
        }),
      ),
    );
  }

  async findByVisit(visit_id: number) {
    return this.prisma.opd_tests.findMany({
      where: { visit_id },
      include: {
        tests: true,
      },
      orderBy: { ordered_at: 'desc' },
    });
  }

  async findPendingByHospital(hospital_id: number) {
    return this.prisma.opd_tests.findMany({
      where: {
        AND: [
          { test_status: { not: 'Completed' } },
          { opd_visits: { hospital_id } }
        ]
      },
      include: {
        tests: true,
        opd_visits: {
          include: {
            patients: {
              include: {
                users_patients_user_idTousers: {
                  select: { full_name: true, phone_number: true }
                }
              }
            },
            doctors: {
              include: {
                users_doctors_user_idTousers: {
                  select: { full_name: true }
                }
              }
            }
          }
        }
      },
      orderBy: { ordered_at: 'desc' },
    });
  }

  async updateResult(id: number, test_status: string, result_summary?: string) {
    const data: any = { test_status, result_summary };
    if (test_status === 'Completed') {
      data.completed_at = new Date();
    }

    return this.prisma.opd_tests.update({
      where: { opd_test_id: id },
      data,
    });
  }
}
