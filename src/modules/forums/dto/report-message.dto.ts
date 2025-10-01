import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportMessageDto {
  @ApiProperty({
    description: 'Reason/comment for reporting this message',
    example: 'This message contains offensive language'
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Please provide at least 10 characters explaining why you are reporting this message' })
  @MaxLength(1000)
  comment: string;
}

export class ReportResponse {
  @ApiProperty()
  reportId: number;

  @ApiProperty()
  messageId: number;

  @ApiProperty()
  success: boolean;
}

export class MessageReportDetails {
  @ApiProperty()
  idReport: number;

  @ApiProperty()
  idMsg: number;

  @ApiProperty()
  comment: string;

  @ApiProperty()
  timeStarted: number;

  @ApiProperty()
  closed: number;

  @ApiProperty({ required: false })
  closedBy?: number;

  @ApiProperty({ required: false })
  timeClose?: number;

  @ApiProperty()
  reporter: {
    id: number;
    memberName: string;
    emailAddress: string;
  };

  @ApiProperty()
  message: {
    id: number;
    subject: string;
    body: string;
    posterName: string;
    posterTime: number;
    topicId: number;
    boardId: number;
  };

  @ApiProperty({ required: false })
  closer?: {
    id: number;
    memberName: string;
  };
}

export class GetReportsQueryDto {
  @ApiProperty({ required: false, description: 'Filter by status: 0 = open, 1 = closed', example: 0 })
  status?: number;

  @ApiProperty({ required: false, description: 'Limit number of results', example: 20 })
  limit?: number;

  @ApiProperty({ required: false, description: 'Offset for pagination', example: 0 })
  offset?: number;
}

export class CloseReportDto {
  // No body needed - just the endpoint call will close it
}
