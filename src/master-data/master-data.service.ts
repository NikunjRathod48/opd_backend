import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MasterDataService {
  constructor(private prisma: PrismaService) {}

  // Map URL param 'type' to Prisma Model Delegate
  private getDelegate(type: string) {
    switch (type) {
      case 'medicines':
        return this.prisma.medicines;
      case 'tests':
        return this.prisma.tests;
      case 'treatments':
        return this.prisma.treatment_types;
      case 'diagnoses':
        return this.prisma.diagnoses;
      case 'departments':
        return this.prisma.departments_master;
      case 'specializations':
        return this.prisma.specializations;
      case 'procedures':
        return this.prisma.procedures;
      case 'states':
        return this.prisma.states;
      case 'cities':
        return this.prisma.cities;
      case 'blood_groups':
        return this.prisma.blood_groups;
      default:
        throw new BadRequestException(`Invalid master data type: ${type}`);
    }
  }

  private getIdField(type: string) {
    switch (type) {
      case 'medicines':
        return 'medicine_id';
      case 'tests':
        return 'test_id';
      case 'treatments':
        return 'treatment_type_id';
      case 'diagnoses':
        return 'diagnosis_id';
      case 'departments':
        return 'department_id';
      case 'specializations':
        return 'specialization_id';
      case 'procedures':
        return 'procedure_id';
      case 'states':
        return 'state_id';
      case 'cities':
        return 'city_id';
      case 'blood_groups':
        return 'blood_group_id';
      default:
        return 'id';
    }
  }

  // New Helper Methods for Hospital Logic
  private getHospitalDelegate(type: string) {
    switch (type) {
      case 'medicines':
        return this.prisma.hospital_medicines;
      case 'tests':
        return this.prisma.hospital_tests;
      case 'treatments':
        return this.prisma.hospital_treatments;
      case 'procedures':
        return this.prisma.hospital_procedures;
      case 'departments':
        return this.prisma.hospital_departments;
      case 'diagnoses':
        return this.prisma.hospital_diagnoses;
      default:
        return null;
    }
  }

  private getHospitalRelationField(type: string) {
    switch (type) {
      case 'medicines':
        return 'hospital_medicines';
      case 'tests':
        return 'hospital_tests';
      case 'treatments':
        return 'hospital_treatments';
      case 'procedures':
        return 'hospital_procedures';
      case 'departments':
        return 'hospital_departments';
      case 'diagnoses':
        return 'hospital_diagnoses';
      default:
        return 'unknown';
    }
  }

  private getHospitalIdField(type: string) {
    switch (type) {
      case 'medicines':
        return 'hospital_medicine_id';
      case 'tests':
        return 'hospital_test_id';
      case 'treatments':
        return 'hospital_treatment_id';
      case 'procedures':
        return 'hospital_procedure_id';
      case 'departments':
        return 'hospital_department_id';
      case 'diagnoses':
        return 'hospital_diagnosis_id';
      default:
        return 'id';
    }
  }

  private hasIsActiveField(type: string) {
    // Based on schema.prisma
    // Available in: medicines, tests, treatment_types, procedures, specializations
    // NOT Available in: departments, diagnoses
    const typesWithIsActive = [
      'medicines',
      'tests',
      'treatments',
      'procedures',
      'specializations',
      'states',
      'cities',
      'blood_groups',
    ];
    return typesWithIsActive.includes(type);
  }

  async findAll(type: string, query: any, hospitalId?: number) {
    const delegate = this.getDelegate(type);
    const idField = this.getIdField(type);

    // If no hospitalId, return standard master list (SuperAdmin view)
    if (!hospitalId) {
      const where: any = {};
      if (this.hasIsActiveField(type) && query.active === 'true') {
        where.is_active = true;
      }

      if (type === 'cities') {
        return (delegate as any).findMany({
          where,
          include: { states: true },
          orderBy: { [idField]: 'asc' }, // Cities usually alpha
        });
      }

      const items = await (delegate as any).findMany({
        where,
        orderBy: { [idField]: 'desc' },
      });

      return items.map((item: any) => ({
        ...item,
        price: item.price !== undefined ? Number(item.price) : undefined,
      }));
    }

    // If HospitalId, we need to join or map
    const relationField = this.getHospitalRelationField(type);
    if (relationField === 'unknown') {
      // Fallback for types without hospital mapping
      return (delegate as any).findMany({
        orderBy: { [idField]: 'desc' },
      });
    }

    // Build where clause
    const where: any = {};
    if (this.hasIsActiveField(type)) {
      where.is_active = true;
    }

    const masterItems = await (delegate as any).findMany({
      where,
      include: {
        [relationField]: {
          where: { hospital_id: hospitalId },
        },
      },
      orderBy: { [idField]: 'asc' },
    });

    // Flatten for Frontend
    return masterItems.map((item: any) => {
      const hospitalRelation = item[relationField]?.[0];
      return {
        ...item,
        base_price: item.price !== undefined ? Number(item.price) : 0,
        price:
          hospitalRelation?.price !== undefined
            ? Number(hospitalRelation.price)
            : item.price !== undefined
              ? Number(item.price)
              : 0, // Fallback to master base price
        stock_quantity: hospitalRelation?.stock_quantity || 0,
        is_active_in_hospital: hospitalRelation
          ? hospitalRelation.is_active
          : false,
        is_linked: !!hospitalRelation,
        hospital_record_id: hospitalRelation
          ? hospitalRelation[this.getHospitalIdField(type)]
          : null,
      };
    });
  }

  async create(type: string, data: any, hospitalId?: number) {
    if (hospitalId) {
      // Hospital Admin "Create" means Link/Upsert
      return this.upsertHospitalRecord(type, data, hospitalId);
    }

    const delegate = this.getDelegate(type);
    const { 
      id,
      stock_quantity,
      is_active_in_hospital,
      is_linked,
      hospital_record_id,
      ...createData
    } = data;

    if (createData.treatment_type_id !== undefined) {
      const tId = createData.treatment_type_id;
      delete createData.treatment_type_id;
      createData.treatment_types = {
        connect: { treatment_type_id: Number(tId) },
      };
    }
    if (createData.department_id !== undefined) {
      const dId = createData.department_id;
      delete createData.department_id;
      createData.departments_master = {
        connect: { department_id: Number(dId) },
      };
    }

    try {
      return await (delegate as any).create({ data: createData });
    } catch (error: any) {
      console.error(`MasterData Create Error (${type}):`, error);
      throw new BadRequestException(
        `Failed to create entry: ${error.message || 'Check for unique constraints or missing required fields.'}`,
      );
    }
  }

  async update(type: string, id: number, data: any, hospitalId?: number) {
    if (hospitalId) {
      // Hospital Admin "Update" means Update Price/Stock/Status in ID mapping
      // NOTE: 'id' here is the MASTER ID
      return this.upsertHospitalRecord(
        type,
        { ...data, [this.getIdField(type)]: id },
        hospitalId,
      );
    }

    const delegate = this.getDelegate(type);
    const idField = this.getIdField(type);

    try {
      // Exclude hospital specific fields
      const {
        stock_quantity,
        is_active_in_hospital,
        is_linked,
        hospital_record_id,
        ...updateData
      } = data;

      if (updateData.treatment_type_id !== undefined) {
        const tId = updateData.treatment_type_id;
        delete updateData.treatment_type_id;
        updateData.treatment_types = {
          connect: { treatment_type_id: Number(tId) },
        };
      }
      if (updateData.department_id !== undefined) {
        const dId = updateData.department_id;
        delete updateData.department_id;
        updateData.departments_master = {
          connect: { department_id: Number(dId) },
        };
      }

      return await (delegate as any).update({
        where: { [idField]: id },
        data: updateData,
      });
    } catch (error) {
      console.error('Master Update Error:', error);
      throw new BadRequestException('Failed to update entry.');
    }
  }

  async toggleStatus(type: string, id: number) {
    if (!this.hasIsActiveField(type)) {
      throw new BadRequestException(`Status toggle not supported for ${type}`);
    }

    const delegate = this.getDelegate(type);
    const idField = this.getIdField(type);

    const item = await (delegate as any).findUnique({
      where: { [idField]: id },
    });
    if (!item) throw new NotFoundException('Item not found');

    return (delegate as any).update({
      where: { [idField]: id },
      data: { is_active: !item.is_active },
    });
  }

  private async upsertHospitalRecord(
    type: string,
    data: any,
    hospitalId: number,
  ) {
    const delegate = this.getHospitalDelegate(type);
    if (!delegate)
      throw new BadRequestException(
        `No hospital configuration available for ${type}`,
      );

    const masterIdField = this.getIdField(type);
    let masterId = data[masterIdField];

    // If data doesn't contain masterId (like in PUT body), check if it's already an integer or throw better error
    if (!masterId) {
      throw new BadRequestException(
        `Missing Master ID field: ${masterIdField}. Payload: ${JSON.stringify(data)}`,
      );
    }

    // Ensure masterId is a number
    masterId = Number(masterId);

    const upsertData: any = {
      hospital_id: hospitalId,
      [masterIdField]: masterId,
      is_active:
        data.is_active_in_hospital !== undefined
          ? data.is_active_in_hospital
          : data.is_active !== undefined
            ? data.is_active
            : true,
    };

    let createData: any = { ...upsertData };

    if (type === 'medicines') {
      if (data.price !== undefined) {
        upsertData.price = data.price;
        createData.price = data.price;
      } else {
        const master = await this.prisma.medicines.findUnique({ where: { medicine_id: masterId } });
        createData.price = master?.price || 0;
      }
      if (data.stock_quantity !== undefined) {
        upsertData.stock_quantity = data.stock_quantity;
        createData.stock_quantity = data.stock_quantity;
      }
    } else if (type === 'tests') {
      if (data.price !== undefined) {
        upsertData.price = data.price;
        createData.price = data.price;
      } else {
        const master = await this.prisma.tests.findUnique({ where: { test_id: masterId } });
        createData.price = master?.price || 0;
      }

      // Auto-link Department for Hospital Filter UI
      try {
        const masterTest = await this.prisma.tests.findUnique({
          where: { test_id: masterId },
        });
        if (masterTest) {
          const existingDept =
            await this.prisma.hospital_departments.findUnique({
              where: {
                hospital_id_department_id: {
                  hospital_id: hospitalId,
                  department_id: masterTest.department_id,
                },
              },
            });
          if (!existingDept) {
            await this.prisma.hospital_departments.create({
              data: {
                hospital_id: hospitalId,
                department_id: masterTest.department_id,
                is_active: true,
              },
            });
          }
        }
      } catch (err) {
        console.error('Failed to auto-link department for test', err);
      }
    } else if (type === 'diagnoses') {
      // Auto-link Department for Hospital Filter UI
      try {
        const masterDiag = await this.prisma.diagnoses.findUnique({
          where: { diagnosis_id: masterId },
        });
        if (masterDiag) {
          const existingDept =
            await this.prisma.hospital_departments.findUnique({
              where: {
                hospital_id_department_id: {
                  hospital_id: hospitalId,
                  department_id: masterDiag.department_id,
                },
              },
            });
          if (!existingDept) {
            await this.prisma.hospital_departments.create({
              data: {
                hospital_id: hospitalId,
                department_id: masterDiag.department_id,
                is_active: true,
              },
            });
          }
        }
      } catch (err) {
        console.error('Failed to auto-link department for diagnosis', err);
      }
    } else if (type === 'procedures') {
      if (data.price !== undefined) {
        upsertData.price = data.price;
        createData.price = data.price;
      } else {
        const master = await this.prisma.procedures.findUnique({ where: { procedure_id: masterId } });
        createData.price = master?.price || 0;
      }

      // Logic for Hospital Procedures: Must link to a Hospital Treatment
      // 1. Get the Master Procedure to find its Treatment Type
      const masterProcedure = await this.prisma.procedures.findUnique({
        where: { procedure_id: masterId },
      });

      if (!masterProcedure)
        throw new NotFoundException('Master Procedure not found');

      // 2. Ensure Hospital Treatment exists
      // Use try-catch for this specific lookup to debug
      try {
        let hospitalTreatment =
          await this.prisma.hospital_treatments.findUnique({
            where: {
              hospital_id_treatment_type_id: {
                hospital_id: hospitalId,
                treatment_type_id: masterProcedure.treatment_type_id,
              },
            },
          });

        // 3. If not exists, allow auto-creation
        if (!hospitalTreatment) {
          hospitalTreatment = await this.prisma.hospital_treatments.create({
            data: {
              hospital_id: hospitalId,
              treatment_type_id: masterProcedure.treatment_type_id,
              is_active: true,
            },
          });
        }
        // 4. Link
        upsertData.hospital_treatment_id =
          hospitalTreatment.hospital_treatment_id;
        createData.hospital_treatment_id =
          hospitalTreatment.hospital_treatment_id;
      } catch (err) {
        console.error('Error ensuring Linked Treatment exists:', err);
        // Fallback or rethrow? If we can't link, we can't save the procedure as per new schema
        throw new BadRequestException(
          `Failed to link treatment category: ${err.message}`,
        );
      }
    }

    // Use where clause that matches Prisma's compound unique requirement
    const whereClause = {
      [`hospital_id_${masterIdField}`]: {
        hospital_id: hospitalId,
        [masterIdField]: masterId,
      },
    };

    try {
      return await (delegate as any).upsert({
        where: whereClause,
        update: upsertData,
        create: createData,
      });
    } catch (e) {
      console.error('Upsert Failed Details:', JSON.stringify(e, null, 2));
      if (e.code === 'P2002') {
        throw new BadRequestException('Duplicate entry exists.');
      }
      // Check for unknown argument error (schema out of sync)
      if (e.message && e.message.includes('Unknown argument')) {
        throw new BadRequestException(
          'Database schema mismatch. Please restart the server and ensure Prisma Client is generated.',
        );
      }
      throw new BadRequestException(
        `Failed to save hospital settings: ${e.message}`,
      );
    }
  }
}
