import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionFilter } from './filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // Global exception filters
  // Order: AllExceptionFilter (catch-all fallback) → PrismaExceptionFilter (specific)
  // NestJS evaluates filters in reverse order, so the last registered filter runs first.
  app.useGlobalFilters(
    new AllExceptionFilter(),
  );

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
