import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MasterService } from './master.service';

@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Public()
  @Get('states')
  getStates() {
    return this.masterService.getStates();
  }

  @Public()
  @Get('cities/:stateId')
  getCities(@Param('stateId', ParseIntPipe) stateId: number) {
    return this.masterService.getCities(stateId);
  }
}
