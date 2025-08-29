import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForumMessageQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  boardId?: number;
}

export interface ForumMessage {
  id: number;
  topicId: number;
  boardId: number;
  subject: string;
  body: string;
  posterTime: number;
  posterName: string;
  memberId: number;
  boardName: string;
  topicReplies: number;
  topicViews: number;
  isFirstMessage: boolean;
  lastMessageTime?: number;
  lastPosterName?: string;
}

export interface ForumMessageResponse {
  messages: ForumMessage[];
  total: number;
  limit: number;
  offset: number;
}