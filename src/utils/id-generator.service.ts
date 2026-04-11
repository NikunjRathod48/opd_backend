import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdGeneratorService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generates a UHID for a patient.
   * Format: UHID-{GROUP_CODE}-{SEQUENCE}
   * Example: UHID-MAX-1004
   */
  async generatePatientId(hospitalGroupId: number): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Get Group Code
      const group = await tx.hospital_groups.findUnique({
        where: { hospital_group_id: hospitalGroupId },
        select: { group_code: true },
      });
      const groupCode = group?.group_code || 'GRP';

      // 2. Get/Increment Counter
      let counter = await tx.group_counters.findUnique({
        where: {
          hospital_group_id_counter_type: {
            hospital_group_id: hospitalGroupId,
            counter_type: 'UHID',
          },
        },
      });

      if (!counter) {
        counter = await tx.group_counters.create({
          data: {
            hospital_group_id: hospitalGroupId,
            counter_type: 'UHID',
            current_value: 0,
            prefix: 'UHID',
          },
        });
      }

      const nextVal = counter.current_value + 1;

      // 3. Update Counter
      await tx.group_counters.update({
        where: {
          hospital_group_id_counter_type: {
            hospital_group_id: hospitalGroupId,
            counter_type: 'UHID',
          },
        },
        data: { current_value: nextVal },
      });

      // 4. Format
      return `UHID-${groupCode}-${nextVal.toString().padStart(4, '0')}`;
    });
  }

  /**
   * Generates an Appointment Number.
   * Format: APT-{HOSP_CODE}-{YYYYMMDD}-{SEQUENCE}
   * Example: APT-SAKET-20240220-001
   */
  async generateAppointmentNumber(
    hospitalId: number,
    userId: number = 1,
  ): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const hospital = await tx.hospitals.findUnique({
          where: { hospital_id: hospitalId },
          select: { hospital_code: true },
        });
        const hospCode = hospital?.hospital_code || 'HOSP';
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

        let counter = await tx.hospital_counters.findUnique({
          where: {
            hospital_id_counter_type: {
              hospital_id: hospitalId,
              counter_type: 'APPOINTMENT',
            },
          },
        });

        if (!counter) {
          console.log(
            `Counter not found for hospital ${hospitalId}, creating new one... Policy: YEARLY`,
          );
          counter = await tx.hospital_counters.create({
            data: {
              hospital_id: hospitalId,
              counter_type: 'APPOINTMENT',
              current_value: 0,
              prefix: 'APT',
              reset_policy: 'YEARLY',
              created_by: userId,
              modified_by: userId,
            },
          });
        }

        const nextVal = counter.current_value + 1;

        await tx.hospital_counters.update({
          where: { counter_id: counter.counter_id },
          data: { current_value: nextVal },
        });

        return `APT-${hospCode}-${dateStr}-${nextVal.toString().padStart(3, '0')}`;
      });
    } catch (error) {
      console.error('Error in generateAppointmentNumber:', error);
      throw error;
    }
  }

  /**
   * Generates an OPD Number.
   * Format: OPD-{HOSP_CODE}-{YYYYMMDD}-{SEQUENCE}
   * Example: OPD-SAKET-20240220-104
   */
  async generateOpdNumber(
    hospitalId: number,
    userId: number = 1,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const hospital = await tx.hospitals.findUnique({
        where: { hospital_id: hospitalId },
        select: { hospital_code: true },
      });
      const hospCode = hospital?.hospital_code || 'HOSP';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      let counter = await tx.hospital_counters.findUnique({
        where: {
          hospital_id_counter_type: {
            hospital_id: hospitalId,
            counter_type: 'OPD',
          },
        },
      });

      if (!counter) {
        counter = await tx.hospital_counters.create({
          data: {
            hospital_id: hospitalId,
            counter_type: 'OPD',
            current_value: 0,
            reset_policy: 'YEARLY',
            created_by: userId,
            modified_by: userId,
          },
        });
      }

      const nextVal = counter.current_value + 1;

      await tx.hospital_counters.update({
        where: { counter_id: counter.counter_id },
        data: { current_value: nextVal },
      });

      return `OPD-${hospCode}-${dateStr}-${nextVal.toString().padStart(4, '0')}`;
    });
  }

  /**
   * Generates a Bill/Receipt Number.
   * Format: RCPT-{HOSP_CODE}-{YYYYMM}-{SEQUENCE}
   * Example: RCPT-SAKET-202402-5001
   */
  async generateBillNumber(
    hospitalId: number,
    userId: number = 1,
    client: any = null,
  ): Promise<string> {
    const operation = async (tx: any) => {
      const hospital = await tx.hospitals.findUnique({
        where: { hospital_id: hospitalId },
        select: { hospital_code: true },
      });
      const hospCode = hospital?.hospital_code || 'HOSP';
      const monthStr = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

      let counter = await tx.hospital_counters.findUnique({
        where: {
          hospital_id_counter_type: {
            hospital_id: hospitalId,
            counter_type: 'BILL',
          },
        },
      });

      if (!counter) {
        counter = await tx.hospital_counters.create({
          data: {
            hospital_id: hospitalId,
            counter_type: 'BILL',
            current_value: 0,
            reset_policy: 'YEARLY',
            created_by: userId,
            modified_by: userId,
          },
        });
      }

      const nextVal = counter.current_value + 1;

      await tx.hospital_counters.update({
        where: { counter_id: counter.counter_id },
        data: { current_value: nextVal },
      });

      return `RCPT-${hospCode}-${monthStr}-${nextVal.toString().padStart(4, '0')}`;
    };

    if (client) {
        return operation(client);
    }
    return this.prisma.$transaction(operation);
  }
}
