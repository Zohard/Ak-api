import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from '../../shared/services/metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}