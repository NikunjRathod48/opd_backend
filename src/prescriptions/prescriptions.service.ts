import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  async create(createPrescriptionDto: CreatePrescriptionDto, userId: number) {
    const { visit_id, doctor_id, notes, items } = createPrescriptionDto;

    return this.prisma.$transaction(async (tx) => {
      // Verify visit exists
      const visit = await tx.opd_visits.findUnique({
        where: { opd_id: visit_id },
      });

      if (!visit) {
        throw new NotFoundException(`OPD Visit with ID ${visit_id} not found`);
      }

      // Clear existing prescriptions and items for this visit
      const existingRx = await tx.prescriptions.findMany({
        where: { visit_id },
      });
      for (const rx of existingRx) {
        // We no longer restore stock here since prescribing doesn't deduct stock anymore

        await tx.prescription_items.deleteMany({
          where: { prescription_id: rx.prescription_id },
        });
        await tx.prescriptions.delete({
          where: { prescription_id: rx.prescription_id },
        });
      }

      // Handled by Pharmacy Module instead of Doctor's Module now.

      // Create prescription with nested items
      return tx.prescriptions.create({
        data: {
          visit_id,
          doctor_id,
          notes,
          created_by: userId,
          modified_by: userId,
          prescription_items: {
            create: items.map((item) => ({
              medicine_id: item.medicine_id,
              dosage: item.dosage,
              quantity: item.quantity,
              duration_days: item.duration_days,
              instructions: item.instructions,
            })),
          },
        },
        include: {
          prescription_items: {
            include: {
              medicines: true,
            },
          },
        },
      });
    });
  }

  async findByVisit(visit_id: number) {
    return this.prisma.prescriptions.findMany({
      where: { visit_id, is_active: true },
      include: {
        prescription_items: {
          include: {
            medicines: true,
          },
        },
        doctors: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findAllPending(hospital_id: number) {
    return this.prisma.prescriptions.findMany({
      where: {
        is_active: true,
        status: 'Pending',
        opd_visits: {
          hospital_id: hospital_id,
        },
      },
      include: {
        prescription_items: {
          include: {
            medicines: true,
          },
        },
        doctors: { include: { users_doctors_user_idTousers: { select: { full_name: true } } } },
        opd_visits: { include: { patients: { select: { users_patients_user_idTousers: { select: { full_name: true } }, patient_no: true } } } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async dispense(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Find prescription
      const rx = await tx.prescriptions.findUnique({
        where: { prescription_id: id },
        include: {
          prescription_items: {
            include: { medicines: true }
          },
          opd_visits: true,
        },
      });

      if (!rx) throw new NotFoundException('Prescription not found');
      if (rx.status === 'Dispensed') throw new BadRequestException('Prescription already dispensed');

      const hospital_id = rx.opd_visits?.hospital_id;
      if (!hospital_id) throw new BadRequestException('Invalid Visit / Hospital link');

      // Deduct stock for each item
      for (const item of rx.prescription_items) {
        const hospMed = await tx.hospital_medicines.findUnique({
          where: {
            hospital_id_medicine_id: {
              hospital_id,
              medicine_id: item.medicine_id,
            },
          },
        });

        if (hospMed) {
          if (hospMed.stock_quantity < item.quantity) {
             throw new BadRequestException(`Insufficient stock for medicine: ${item.medicines?.medicine_name || item.medicine_id}`);
          }
          await tx.hospital_medicines.update({
            where: { hospital_medicine_id: hospMed.hospital_medicine_id },
            data: { stock_quantity: hospMed.stock_quantity - item.quantity },
          });
        } else {
           throw new BadRequestException(`Medicine ${item.medicines?.medicine_name || item.medicine_id} not found in hospital inventory`);
        }
      }

      // Add to Existing Pending Bill (Option B Workflow)
      const existingBill = await tx.billing.findFirst({
        where: {
          visit_id: rx.visit_id,
          NOT: { payment_status: 'Paid' },
        },
      });

      if (existingBill) {
        const newBillItems: any[] = [];
        let additionalPreTaxTotal = 0;

        for (const item of rx.prescription_items) {
          const med = await tx.medicines.findUnique({ where: { medicine_id: item.medicine_id } });
          const price = Number(med?.price || 0);
          const qty = item.quantity || 1;
          const totalLinePrice = price * qty;

          newBillItems.push({
            bill_id: existingBill.bill_id,
            item_type: 'Medicine',
            reference_id: item.medicine_id,
            item_description: med?.medicine_name || 'Medicine',
            quantity: qty,
            unit_price: price,
            total_price: totalLinePrice,
          });
          additionalPreTaxTotal += totalLinePrice;
        }

        if (newBillItems.length > 0) {
          await tx.bill_items.createMany({ data: newBillItems });
          await tx.billing.update({
             where: { bill_id: existingBill.bill_id },
             data: {
               subtotal_amount: Number(existingBill.subtotal_amount) + additionalPreTaxTotal,
               modified_by: userId,
             }
          });
        }
      }

      // Mark Dispensed
      return tx.prescriptions.update({
        where: { prescription_id: id },
        data: {
          status: 'Dispensed',
          modified_by: userId,
          modified_at: new Date(),
        },
      });
    });
  }
}
