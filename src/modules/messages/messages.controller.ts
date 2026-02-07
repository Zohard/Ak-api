import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesDto, SearchMessagesDto, MarkReadDto, MarkThreadReadDto, DeleteMessageDto, BulkDeleteMessagesDto, BulkMarkImportantDto, GetMessagesWithFilterDto } from './dto/get-messages.dto';
import { SmfMessage, MessageUser, MessageResponse, ConversationMessage } from './interfaces/message.interface';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(@Body() createMessageDto: CreateMessageDto): Promise<MessageResponse> {
    return await this.messagesService.sendMessage(createMessageDto);
  }

  @Get()
  async getMessages(
    @Query() getMessagesDto: GetMessagesWithFilterDto,
    @CurrentUser() user: any,
  ): Promise<{ messages: SmfMessage[] }> {
    // Use authenticated user's ID if not provided in query
    const messagesDto = { ...getMessagesDto, userId: getMessagesDto.userId || user.id };
    const messages = await this.messagesService.getMessages(messagesDto);
    return { messages };
  }

  @Get('conversation/:threadId')
  async getConversationThread(
    @Param('threadId', ParseIntPipe) threadId: number,
    @Query('userId', ParseIntPipe) userId: number,
  ): Promise<{ messages: ConversationMessage[] }> {
    const messages = await this.messagesService.getConversationThread(threadId, userId);
    return { messages };
  }

  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Body() markReadDto: MarkReadDto): Promise<{ success: boolean }> {
    await this.messagesService.markAsRead(markReadDto);
    return { success: true };
  }

  @Post('mark-thread-read')
  @HttpCode(HttpStatus.OK)
  async markThreadAsRead(@Body() dto: MarkThreadReadDto): Promise<{ success: boolean; markedCount: number }> {
    const markedCount = await this.messagesService.markThreadAsRead(dto.threadId, dto.userId);
    return { success: true, markedCount };
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(@Body() deleteMessageDto: DeleteMessageDto): Promise<{ success: boolean }> {
    await this.messagesService.deleteMessage(deleteMessageDto);
    return { success: true };
  }

  @Get('unread-count')
  async getUnreadCount(@Query('userId', ParseIntPipe) userId: number): Promise<{ unreadCount: number }> {
    const unreadCount = await this.messagesService.getUnreadCount(userId);
    return { unreadCount };
  }

  @Get('search')
  async searchMessages(@Query() searchDto: SearchMessagesDto): Promise<{ messages: SmfMessage[] }> {
    const messages = await this.messagesService.searchMessages(searchDto);
    return { messages };
  }

  @Get('users')
  async getUsers(
    @Query('search') searchTerm?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<{ users: MessageUser[] }> {
    const users = await this.messagesService.getUsers(searchTerm, limit);
    return { users };
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDeleteMessages(@Body() bulkDeleteDto: BulkDeleteMessagesDto): Promise<{ success: boolean; deletedCount: number }> {
    const deletedCount = await this.messagesService.bulkDeleteMessages(bulkDeleteDto);
    return { success: true, deletedCount };
  }

  @Post('mark-important')
  @HttpCode(HttpStatus.OK)
  async markImportant(@Body() markImportantDto: BulkMarkImportantDto): Promise<{ success: boolean; updatedCount: number }> {
    const updatedCount = await this.messagesService.bulkMarkImportant(markImportantDto);
    return { success: true, updatedCount };
  }
}