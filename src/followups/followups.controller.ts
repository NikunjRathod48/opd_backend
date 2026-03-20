import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { FollowupsService } from './followups.service';
import { CreateFollowupDto, UpdateFollowupDto } from './dto/followup.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('followups')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist')
export class FollowupsController {
  constructor(private readonly followupsService: FollowupsService) {}

  /**
   * POST /followups — Create a follow-up recommendation
   */
  @Post()
  @Roles('Doctor')
  create(@Body() dto: CreateFollowupDto) {
    return this.followupsService.create(dto);
  }

  /**
   * GET /followups — List all follow-ups with optional filters
   * Query params: hospital_id, status, from_date, to_date
   */
  @Get()
  findAll(@Query() query: any) {
    return this.followupsService.findAll(query);
  }

  /**
   * GET /followups/visit/:visitId — Get follow-ups for a specific OPD visit
   */
  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string) {
    return this.followupsService.findByVisit(+visitId);
  }

  /**
   * GET /followups/:id — Get a single follow-up
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.followupsService.findOne(+id);
  }

  /**
   * PATCH /followups/:id — Update follow-up status or details
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFollowupDto) {
    return this.followupsService.update(+id, dto);
  }
}
