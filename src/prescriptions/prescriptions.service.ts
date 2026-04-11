import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdGeneratorService } from '../utils/id-generator.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private idGenerator: IdGeneratorService,
  ) {}

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
        status: { in: ['Pending', 'Partially Dispensed'] },
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

  async dispense(id: number, userId: number, itemIds?: number[]) {
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

      // Filter to only 'Pending' items, and if itemIds array is passed, only those.
      const itemsToProcess = rx.prescription_items.filter(item => {
        // Use generic casting for status to prevent strict TS errors before Prisma client regenerates
        if ((item as any).status === 'Dispensed') return false; 
        if (itemIds && itemIds.length > 0) {
          return itemIds.includes(item.prescription_item_id);
        }
        return true; // if no itemIds passed, process all remaining pending
      });

      if (itemsToProcess.length === 0) {
         throw new BadRequestException('No pending items selected for dispensing');
      }

      // Deduct stock for each item
      for (const item of itemsToProcess) {
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

          await tx.prescription_items.update({
            where: { prescription_item_id: item.prescription_item_id },
            data: { status: 'Dispensed' } as any, // Cast to any to bypass immediate TypeScript error
          });
        } else {
           throw new BadRequestException(`Medicine ${item.medicines?.medicine_name || item.medicine_id} not found in hospital inventory`);
        }
      }

      // Create an independent Pharmacy Bill
      const pendingMedicineItems: any[] = [];
      let medicineSubtotal = 0;

      for (const item of itemsToProcess) {
        const med = await tx.medicines.findUnique({ where: { medicine_id: item.medicine_id } });
        const price = Number(med?.price || 0);
        const qty = item.quantity || 1;
        const totalLinePrice = price * qty;

        pendingMedicineItems.push({
          item_type: 'Medicine',
          reference_id: item.medicine_id,
          item_description: med?.medicine_name || 'Medicine',
          quantity: qty,
          unit_price: price,
          total_price: totalLinePrice,
        });
        medicineSubtotal += totalLinePrice;
      }

      let generatedBill: any = null;
      if (pendingMedicineItems.length > 0) {
        // Generate new standalone bill number inside the transaction using the tx client
        const newBillNumber = await this.idGenerator.generateBillNumber(hospital_id, userId, tx);
        
        generatedBill = await tx.billing.create({
          data: {
             hospital_id: hospital_id,
             visit_id: rx.visit_id,
             bill_number: newBillNumber,
             subtotal_amount: medicineSubtotal,
             tax_amount: 0,
             discount_amount: 0,
             payment_status: 'Pending',
             billing_status: 'Finalized',
             created_by: userId,
             modified_by: userId,
             bill_items: {
                create: pendingMedicineItems,
             }
          }
        });
      }

      // Evaluate overall status
      const processedItemIds = new Set(itemsToProcess.map(i => i.prescription_item_id));
      const allItemsDispensed = rx.prescription_items.every(item => 
         (item as any).status === 'Dispensed' || processedItemIds.has(item.prescription_item_id)
      );

      const newStatus = allItemsDispensed ? 'Dispensed' : 'Partially Dispensed';

      // Mark status
      await tx.prescriptions.update({
        where: { prescription_id: id },
        data: {
          status: newStatus,
          modified_by: userId,
          modified_at: new Date(),
        },
      });

      return {
        status: newStatus,
        new_bill_id: generatedBill?.bill_id || null
      };
    });
  }
}
