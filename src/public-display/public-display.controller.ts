import { Controller, Get, Query } from '@nestjs/common';
import { PublicDisplayService } from './public-display.service';
import { Public } from '../auth/public.decorator';

@Controller('public')
export class PublicDisplayController {
  constructor(private readonly publicDisplayService: PublicDisplayService) {}

  /**
   * GET /public/queue-display
   *
   * Public, read-only endpoint for TV display screens.
   * NO authentication required.
   *
   * Query params:
   *   - hospital_id (optional): filter by hospital
   *   - doctor_id   (optional): filter by doctor
   */
  @Public()
  @Get('queue-display')
  getQueueDisplay(
    @Query('hospital_id') hospitalId?: string,
    @Query('doctor_id') doctorId?: string,
  ) {
    return this.publicDisplayService.getQueueDisplay(
      hospitalId ? +hospitalId : undefined,
      doctorId ? +doctorId : undefined,
    );
  }
}
