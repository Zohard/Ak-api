import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { EmailService } from '../../shared/services/email.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, PrismaService, EmailService],
  exports: [MessagesService],
})
export class MessagesModule {}