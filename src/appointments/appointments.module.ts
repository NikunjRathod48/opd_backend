import { Module, forwardRef } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilsModule } from '../utils/utils.module';
import { OpdModule } from '../opd/opd.module';

@Module({
  imports: [PrismaModule, UtilsModule, forwardRef(() => OpdModule)],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService], // Export so OPD module can use it if needed
})
export class AppointmentsModule {}
