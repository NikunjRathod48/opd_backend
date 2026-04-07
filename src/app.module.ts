import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { MasterModule } from './master/master.module';
import { HospitalGroupsModule } from './hospital-groups/hospital-groups.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { UsersModule } from './users/users.module';
import { DoctorsModule } from './doctors/doctors.module';
import { PatientsModule } from './patients/patients.module';
import { MasterDataModule } from './master-data/master-data.module';
import { UtilsModule } from './utils/utils.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { OpdModule } from './opd/opd.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { OpdTestsModule } from './opd-tests/opd-tests.module';
import { OpdProceduresModule } from './opd-procedures/opd-procedures.module';
import { BillingModule } from './billing/billing.module';
import { QueuesModule } from './queues/queues.module';
import { ReportsModule } from './reports/reports.module';
import { EventsModule } from './events/events.module';
import { FollowupsModule } from './followups/followups.module';
import { PublicDisplayModule } from './public-display/public-display.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    MasterModule,
    HospitalGroupsModule,
    HospitalsModule,
    UsersModule,
    DoctorsModule,
    PatientsModule,
    MasterDataModule,
    UtilsModule,
    AppointmentsModule,
    OpdModule,
    PrescriptionsModule,
    OpdTestsModule,
    OpdProceduresModule,
    BillingModule,
    QueuesModule,
    ReportsModule,
    EventsModule,
    FollowupsModule,
    PublicDisplayModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule { }
