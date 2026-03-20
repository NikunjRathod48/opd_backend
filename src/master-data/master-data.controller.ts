import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { MasterDataService } from './master-data.service';

@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Public()
  @Get(':type')
  async findAll(@Param('type') type: string, @Query() query: any) {
    const hospitalId = query.hospital_id
      ? parseInt(query.hospital_id)
      : undefined;
    return this.masterDataService.findAll(type, query, hospitalId);
  }

  @Post(':type')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin')
  async create(
    @Param('type') type: string,
    @Body() data: any,
    @Query('hospital_id') hospitalIdQuery?: string,
  ) {
    const hospitalId = hospitalIdQuery ? parseInt(hospitalIdQuery) : undefined;
    return this.masterDataService.create(type, data, hospitalId);
  }

  @Put(':type/:id')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Receptionist', 'Doctor')
  async update(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: any,
    @Query('hospital_id') hospitalIdQuery?: string,
  ) {
    const hospitalId = hospitalIdQuery ? parseInt(hospitalIdQuery) : undefined;
    return this.masterDataService.update(type, id, data, hospitalId);
  }

  @Patch(':type/:id/status')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin')
  async toggleStatus(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.masterDataService.toggleStatus(type, id);
  }
}
