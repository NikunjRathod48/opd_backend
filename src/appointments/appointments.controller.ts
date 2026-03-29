import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

// No @Roles() — all authenticated users can access appointments
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  create(@Body() createAppointmentDto: CreateAppointmentDto, @Req() req: any) {
    const userId = req.user?.userId;
    return this.appointmentsService.create(createAppointmentDto, userId || 1);
  }

  @Get('availability')
  getAvailability(
    @Query('doctor_id') doctorId: string,
    @Query('date') date: string,
    @Query('patient_id') patientId?: string,
  ) {
    return this.appointmentsService.getAvailability(+doctorId, date, patientId ? +patientId : undefined);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.appointmentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId || 1;
    return this.appointmentsService.update(+id, updateAppointmentDto, userId);
  }
}
