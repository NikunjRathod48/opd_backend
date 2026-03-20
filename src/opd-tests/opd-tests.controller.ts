import { Controller, Post, Body, Get, Param, Patch } from '@nestjs/common';
import { OpdTestsService } from './opd-tests.service';
import { CreateOpdTestDto } from './dto/create-opd-test.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('opd-tests')
@Roles('Hospital Admin', 'Doctor', 'Receptionist')
export class OpdTestsController {
  constructor(private readonly opdTestsService: OpdTestsService) {}

  @Post()
  @Roles('Doctor')
  create(@Body() createOpdTestDto: CreateOpdTestDto) {
    return this.opdTestsService.create(createOpdTestDto);
  }

  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string) {
    return this.opdTestsService.findByVisit(+visitId);
  }

  @Get('pending/hospital/:hospitalId')
  findPendingByHospital(@Param('hospitalId') hospitalId: string) {
    return this.opdTestsService.findPendingByHospital(+hospitalId);
  }

  @Patch(':id')
  updateResult(
    @Param('id') id: string,
    @Body('test_status') test_status: string,
    @Body('result_summary') result_summary?: string
  ) {
    return this.opdTestsService.updateResult(+id, test_status, result_summary);
  }
}
