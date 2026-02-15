import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ContactService } from './contact.service';

@ApiTags('Admin - Contact')
@Controller('admin/contact')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class ContactAdminController {
  constructor(private readonly contactService: ContactService) { }

  @Get()
  @ApiOperation({ summary: 'List all contact messages (paginated)' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contactService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get number of unread contact messages' })
  unreadCount() {
    return this.contactService.countUnread();
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a contact message as read' })
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.markAsRead(id);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Send a reply to a contact message' })
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body('response') response: string,
  ) {
    return this.contactService.sendReply(id, response);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact message' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.remove(id);
  }
}
