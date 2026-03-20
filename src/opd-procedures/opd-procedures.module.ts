import { Module } from '@nestjs/common';
import { OpdProceduresService } from './opd-procedures.service';
import { OpdProceduresController } from './opd-procedures.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OpdProceduresController],
  providers: [OpdProceduresService],
})
export class OpdProceduresModule {}
