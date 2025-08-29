import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminContentModule } from './content/admin-content.module';
import { AdminModerationModule } from './moderation/admin-moderation.module';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  imports: [AdminUsersModule, AdminContentModule, AdminModerationModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
  exports: [
    AdminService,
    AdminUsersModule,
    AdminContentModule,
    AdminModerationModule,
  ],
})
export class AdminModule {}
