import { Controller, Post, Get, Delete, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { EditingPresenceService } from './editing-presence.service';

@ApiTags('Admin - Editing Presence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/editing-presence')
export class EditingPresenceController {
  constructor(private readonly presenceService: EditingPresenceService) {}

  @Post(':type/:id')
  async heartbeat(
    @Param('type') type: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    const userId = req.user.id;
    const username = req.user.pseudo || req.user.username || 'Admin';
    await this.presenceService.heartbeat(type, id, userId, username);
    return { ok: true };
  }

  @Get(':type/:id')
  async getEditors(
    @Param('type') type: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    const editors = await this.presenceService.getEditors(type, id, req.user.id);
    return { editors };
  }

  @Delete(':type/:id')
  async release(
    @Param('type') type: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    await this.presenceService.release(type, id, req.user.id);
    return { ok: true };
  }
}
