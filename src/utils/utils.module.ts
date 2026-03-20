import { Module, Global } from '@nestjs/common';
import { IdGeneratorService } from './id-generator.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [IdGeneratorService],
  exports: [IdGeneratorService],
})
export class UtilsModule {}
