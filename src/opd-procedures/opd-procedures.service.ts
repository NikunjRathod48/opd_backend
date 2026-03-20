import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpdProcedureDto } from './dto/create-opd-procedure.dto';

@Injectable()
export class OpdProceduresService {
  constructor(private prisma: PrismaService) {}

  async create(createOpdProcedureDto: CreateOpdProcedureDto) {
    const { visit_id, procedures } = createOpdProcedureDto;

    const visit = await this.prisma.opd_visits.findUnique({
      where: { opd_id: visit_id },
    });

    if (!visit) {
      throw new NotFoundException(`OPD Visit with ID ${visit_id} not found`);
    }

    // Clear existing procedures for this visit
    await this.prisma.opd_procedures.deleteMany({
      where: { visit_id },
    });

    // Bulk create procedures
    return this.prisma.$transaction(
      procedures.map((proc) =>
        this.prisma.opd_procedures.create({
          data: {
            visit_id,
            procedure_id: proc.procedure_id,
            procedure_date: new Date(proc.procedure_date),
            remarks: proc.remarks,
          },
        }),
      ),
    );
  }

  async findByVisit(visit_id: number) {
    return this.prisma.opd_procedures.findMany({
      where: { visit_id },
      include: {
        procedures: true,
      },
      orderBy: { procedure_date: 'desc' },
    });
  }
}
