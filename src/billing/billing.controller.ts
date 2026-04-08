import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Request,
  Query,
  Patch,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateBillingDto } from './dto/create-billing.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('billing')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  create(@Body() createBillingDto: CreateBillingDto, @Request() req) {
    const userId = Number(req.user?.userId) || 1;
    return this.billingService.create(createBillingDto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: any, @Request() req) {
    const userId = Number(req.user?.userId) || 1;
    return this.billingService.update(+id, updateData, userId);
  }

  @Post(':id/pay')
  payBill(@Param('id') id: string, @Body() paymentData: any, @Request() req) {
    const userId = Number(req.user?.userId) || 1;
    return this.billingService.payBill(+id, paymentData, userId);
  }

  @Post(':id/razorpay-order')
  createRazorpayOrder(@Param('id') id: string, @Body() body: any) {
    return this.billingService.createRazorpayOrder(+id, body.amount_paid);
  }

  @Get()
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist', 'Patient')
  findAll(@Query() query: any) {
    return this.billingService.findAll(query);
  }

  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string) {
    return this.billingService.findByVisit(+visitId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.billingService.findOne(+id);
  }
}
