import { Module } from '@nestjs/common';
import { HospitalGroupsService } from './hospital-groups.service';
import { HospitalGroupsController } from './hospital-groups.controller';
import { PrismaModule } from '../prisma/prisma.module';

import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, AuthModule, CloudinaryModule],
  controllers: [HospitalGroupsController],
  providers: [HospitalGroupsService],
})
export class HospitalGroupsModule {}
