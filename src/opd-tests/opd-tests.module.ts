import { Module } from '@nestjs/common';
import { OpdTestsService } from './opd-tests.service';
import { OpdTestsController } from './opd-tests.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OpdTestsController],
  providers: [OpdTestsService],
})
export class OpdTestsModule {}
