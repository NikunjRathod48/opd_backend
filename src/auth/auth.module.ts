import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from './encryption.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') ||
          'fallback_secret_do_not_use_in_prod',
        signOptions: { expiresIn: '7d' }, // 7 days expiration mostly for dev
      }),
      inject: [ConfigService],
    }),
    CloudinaryModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EncryptionService, JwtStrategy],
  exports: [AuthService, JwtModule, EncryptionService],
})
export class AuthModule {}
