import { Controller, Post, Body, Get, Param, Req } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('prescriptions')
@Roles('Hospital Admin', 'Doctor', 'Receptionist')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles('Doctor')
  create(
    @Body() createPrescriptionDto: CreatePrescriptionDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.prescriptionsService.create(createPrescriptionDto, userId);
  }

  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string) {
    return this.prescriptionsService.findByVisit(+visitId);
  }

  @Get('pending/hospital/:hospitalId')
  findAllPending(@Param('hospitalId') hospitalId: string) {
    return this.prescriptionsService.findAllPending(+hospitalId);
  }

  @Post(':id/dispense')
  dispense(
    @Param('id') id: string, 
    @Req() req: any,
    @Body() body: { itemIds?: number[] }
  ) {
    const userId = req.user.userId;
    return this.prescriptionsService.dispense(+id, userId, body.itemIds);
  }
}
