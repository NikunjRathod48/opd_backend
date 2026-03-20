import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Req,
  Query,
} from '@nestjs/common';
import { QueuesService } from './queues.service';
import { Roles } from '../auth/roles.decorator';

@Controller('queues')
@Roles('Hospital Admin', 'Doctor', 'Receptionist')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Post()
  createQueue(
    @Body()
    body: { hospital_id: number; doctor_id: number; queue_date: string },
    @Req() req: any,
  ) {
    const userId = req.user?.userId || 1;
    return this.queuesService.createQueue(
      body.hospital_id,
      body.doctor_id,
      body.queue_date,
      userId,
    );
  }

  @Get()
  findAllQueues(@Query() query: any, @Req() req: any) {
    if (!query.doctor_id && query.resolve_doctor === 'true') {
      query.user_id = req.user?.userId;
    }
    return this.queuesService.findAllQueues(query);
  }

  @Patch(':id/status')
  updateQueueStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: any,
  ) {
    const userId = req.user?.userId || 1;
    return this.queuesService.updateQueueStatus(+id, status, userId);
  }

  // --- Tokens ---

  @Post(':id/tokens')
  generateToken(
    @Param('id') queueId: string,
    @Body() body: { opd_id?: number | null },
  ) {
    return this.queuesService.generateToken(+queueId, body.opd_id);
  }

  @Get(':id/tokens')
  getTokensForQueue(@Param('id') queueId: string) {
    return this.queuesService.getTokensForQueue(+queueId);
  }

  @Patch('tokens/:tokenId/opd')
  linkTokenToOpd(
    @Param('tokenId') tokenId: string,
    @Body('opd_id') opdId: number,
  ) {
    return this.queuesService.linkTokenToOpd(+tokenId, +opdId);
  }

  @Patch('tokens/:tokenId/status')
  updateTokenStatus(
    @Param('tokenId') tokenId: string,
    @Body('status') status: string,
  ) {
    return this.queuesService.updateTokenStatus(+tokenId, status);
  }
}
