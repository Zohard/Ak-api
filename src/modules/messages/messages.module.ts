import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { EmailService } from '../../shared/services/email.service';
import { EncryptionService } from '../../shared/services/encryption.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, PrismaService, EmailService, EncryptionService],
  exports: [MessagesService],
})
export class MessagesModule {}