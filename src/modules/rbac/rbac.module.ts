import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [RolesController, PermissionsController],
  providers: [RolesService, PermissionsService, PrismaService],
  exports: [RolesService, PermissionsService],
})
export class RbacModule {}
