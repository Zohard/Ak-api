import { Module } from '@nestjs/common';
import { AdminForumsController } from './admin-forums.controller';
import { AdminForumsService } from './admin-forums.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminForumsController],
  providers: [AdminForumsService, PrismaService],
  exports: [AdminForumsService],
})
export class AdminForumsModule {}