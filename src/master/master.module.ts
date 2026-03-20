import { Module } from '@nestjs/common';
import { MasterService } from '../master/master.service';
import { MasterController } from '../master/master.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MasterController],
  providers: [MasterService],
})
export class MasterModule {}
