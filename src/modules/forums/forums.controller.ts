import { Controller, Get, Query } from '@nestjs/common';
import { ForumsService } from './forums.service';
import { ForumMessageQueryDto } from './dto/forum-message.dto';

@Controller('forums')
export class ForumsController {
  constructor(private readonly forumsService: ForumsService) {}

  @Get('messages/latest')
  async getLatestMessages(@Query() query: ForumMessageQueryDto) {
    return await this.forumsService.getLatestMessages(query);
  }

  @Get('boards')
  async getBoardList() {
    return await this.forumsService.getBoardList();
  }
}