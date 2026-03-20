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
import { OpdService } from './opd.service';
import { CreateOpdVisitDto } from './dto/create-opd-visit.dto';
import { UpdateOpdVisitDto } from './dto/update-opd-visit.dto';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { AddTestDto } from './dto/add-test.dto';
import { AddProcedureDto } from './dto/add-procedure.dto';
import { AddPrescriptionDto } from './dto/add-prescription.dto';
import { UpsertVitalsDto } from './dto/upsert-vitals.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('opd')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist')
export class OpdController {
  constructor(private readonly opdService: OpdService) {}

  @Post()
  create(@Body() dto: CreateOpdVisitDto, @Req() req: any) {
    const userId = req.user?.userId || 1;
    return this.opdService.create(dto, userId);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.opdService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opdService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOpdVisitDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId || 1;
    return this.opdService.update(+id, dto, userId);
  }

  // --- Clinical Sub-modules (Doctor only) ---

  @Post(':id/diagnoses')
  @Roles('Doctor')
  addDiagnosis(@Param('id') id: string, @Body() dto: AddDiagnosisDto) {
    return this.opdService.addDiagnosis(+id, dto);
  }

  @Post(':id/tests')
  @Roles('Doctor')
  addTest(@Param('id') id: string, @Body() dto: AddTestDto) {
    return this.opdService.addTest(+id, dto);
  }

  @Post(':id/procedures')
  @Roles('Doctor')
  addProcedure(@Param('id') id: string, @Body() dto: AddProcedureDto) {
    return this.opdService.addProcedure(+id, dto);
  }

  @Post(':id/prescriptions')
  @Roles('Doctor')
  addPrescription(
    @Param('id') id: string,
    @Body() dto: AddPrescriptionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId || 1;
    return this.opdService.addPrescription(+id, dto, userId);
  }

  // --- Vitals (Doctor + Receptionist for triage) ---

  @Get(':id/vitals')
  getVitals(@Param('id') id: string) {
    return this.opdService.getVitals(+id);
  }

  @Patch(':id/vitals')
  @Roles('Hospital Admin', 'Doctor', 'Receptionist')
  upsertVitals(@Param('id') id: string, @Body() dto: UpsertVitalsDto) {
    return this.opdService.upsertVitals(+id, dto);
  }
}
