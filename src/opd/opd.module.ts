import { Module, forwardRef } from '@nestjs/common';
import { OpdService } from './opd.service';
import { OpdController } from './opd.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilsModule } from '../utils/utils.module';
import { EventsModule } from '../events/events.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, UtilsModule, EventsModule, forwardRef(() => AppointmentsModule), BillingModule],
  controllers: [OpdController],
  providers: [OpdService],
  exports: [OpdService], // Export for AppointmentsModule to use createFromAppointment
})
export class OpdModule {}
