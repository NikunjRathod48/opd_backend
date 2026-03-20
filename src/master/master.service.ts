import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MasterService {
  constructor(private prisma: PrismaService) {}

  async getStates() {
    return this.prisma.states.findMany({
      where: { is_active: true },
      orderBy: { state_name: 'asc' },
    });
  }

  async getCities(stateId: number) {
    return this.prisma.cities.findMany({
      where: { state_id: stateId, is_active: true },
      orderBy: { city_name: 'asc' },
    });
  }
}
