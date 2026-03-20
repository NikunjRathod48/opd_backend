import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Req,
  Query,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('patients')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(@Body() createPatientDto: CreatePatientDto, @Req() req: Request) {
    return this.patientsService.create(createPatientDto, req);
  }

  @Get('search')
  search(@Query('q') q: string, @Query('hospital_group_id') hgId?: string) {
    return this.patientsService.search(q || '', hgId ? +hgId : undefined);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.patientsService.findAll(query);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateData: any,
    @Req() req: Request,
  ) {
    return this.patientsService.update(+id, updateData, req);
  }
}
