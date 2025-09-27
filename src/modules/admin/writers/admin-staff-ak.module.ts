import { Module } from '@nestjs/common';
import { AdminStaffAkController } from './admin-staff-ak.controller';
import { AdminStaffAkService } from './admin-staff-ak.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminStaffAkController],
  providers: [AdminStaffAkService, PrismaService],
  exports: [AdminStaffAkService],
})
export class AdminStaffAkModule {}