import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactAdminController } from './contact-admin.controller';
import { ContactService } from './contact.service';
import { EmailService } from '../../shared/services/email.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [ContactController, ContactAdminController],
  providers: [ContactService, EmailService, PrismaService],
})
export class ContactModule {}
