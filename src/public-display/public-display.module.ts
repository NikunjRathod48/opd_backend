import { Module } from '@nestjs/common';
import { PublicDisplayController } from './public-display.controller';
import { PublicDisplayService } from './public-display.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PublicDisplayController],
  providers: [PublicDisplayService],
})
export class PublicDisplayModule {}
