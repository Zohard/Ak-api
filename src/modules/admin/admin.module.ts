import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminContentModule } from './content/admin-content.module';
import { AdminModerationModule } from './moderation/admin-moderation.module';
import { AdminStaffAkModule } from './writers/admin-staff-ak.module';
import { AdminForumsModule } from './forums/admin-forums.module';
import { ToolsModule } from './tools/tools.module';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  imports: [AdminUsersModule, AdminContentModule, AdminModerationModule, AdminStaffAkModule, AdminForumsModule, ToolsModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
  exports: [
    AdminService,
    AdminUsersModule,
    AdminContentModule,
    AdminModerationModule,
    AdminStaffAkModule,
    AdminForumsModule,
    ToolsModule,
  ],
})
export class AdminModule {}
