import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MySqlService } from '../../shared/services/mysql.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MySqlService],
  exports: [MessagesService],
})
export class MessagesModule {}