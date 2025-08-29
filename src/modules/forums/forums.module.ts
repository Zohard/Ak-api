import { Module } from '@nestjs/common';
import { ForumsController } from './forums.controller';
import { ForumsService } from './forums.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [ForumsController],
  providers: [ForumsService, PrismaService],
  exports: [ForumsService],
})
export class ForumsModule {}