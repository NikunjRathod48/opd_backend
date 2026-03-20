import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { OpdProceduresService } from './opd-procedures.service';
import { CreateOpdProcedureDto } from './dto/create-opd-procedure.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('opd-procedures')
@Roles('Hospital Admin', 'Doctor', 'Receptionist')
export class OpdProceduresController {
  constructor(private readonly opdProceduresService: OpdProceduresService) {}

  @Post()
  @Roles('Doctor')
  create(@Body() createOpdProcedureDto: CreateOpdProcedureDto) {
    return this.opdProceduresService.create(createOpdProcedureDto);
  }

  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string) {
    return this.opdProceduresService.findByVisit(+visitId);
  }
}
