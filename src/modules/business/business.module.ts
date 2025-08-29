import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [BusinessController],
  providers: [BusinessService, PrismaService],
  exports: [BusinessService],
})
export class BusinessModule {}
