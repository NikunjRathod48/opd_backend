import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AuthModule } from '../auth/auth.module'; // To import EncryptionService if it's exported, or import EncryptionService directly if it's a provider here?
// Actually AuthModule likely exports EncryptionService. Let's check.
// If not, we might need to import encryption service or move it to a shared module.
// For now, assuming AuthModule exports it or we can import it directly.
// Wait, actually EncryptionService is in AuthModule.
import { EncryptionService } from '../auth/encryption.service';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [UsersController],
  providers: [UsersService, EncryptionService], // Providing EncryptionService here if it's not exported by AuthModule or loop dependency issues. safely providing it again is okay if it's stateless.
})
export class UsersModule {}
