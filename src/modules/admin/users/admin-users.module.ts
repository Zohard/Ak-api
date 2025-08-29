import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService, PrismaService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
