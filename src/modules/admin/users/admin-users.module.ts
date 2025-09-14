import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminMembersController } from './admin-members.controller';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminUsersController, AdminMembersController],
  providers: [AdminUsersService, PrismaService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
