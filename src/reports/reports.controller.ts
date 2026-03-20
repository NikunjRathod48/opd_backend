import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/roles.decorator';

@Controller('reports')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  async getDashboardAnalytics(
    @Query('hospital_id') hospitalId?: string,
    @Query('hospital_group_id') hospitalGroupId?: string,
  ) {
    return this.reportsService.getDashboardAnalytics(
      hospitalId ? Number(hospitalId) : undefined,
      hospitalGroupId ? Number(hospitalGroupId) : undefined,
    );
  }
}
