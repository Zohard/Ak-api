import { Module } from '@nestjs/common';
import { ReviewReportsController } from './review-reports.controller';
import { ReviewReportsService } from './review-reports.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [ReviewReportsController],
  providers: [ReviewReportsService, PrismaService],
  exports: [ReviewReportsService],
})
export class ReviewReportsModule {}
