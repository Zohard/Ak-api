import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminUsersService } from './admin-users.service';
import { UserAdminQueryDto } from './dto/user-admin-query.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/members')
export class AdminMembersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Alias of /admin/users: list forum members (SMF)' })
  @ApiResponse({ status: 200, description: 'Members retrieved successfully' })
  async list(@Query() query: UserAdminQueryDto) {
    return this.adminUsersService.findAll(query);
  }
}

