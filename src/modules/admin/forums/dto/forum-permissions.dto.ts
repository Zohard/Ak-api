import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsArray, IsOptional } from 'class-validator';

export class UpdateBoardPermissionsDto {
  @ApiProperty({ description: 'Board ID' })
  @IsNumber()
  @IsNotEmpty()
  boardId: number;

  @ApiProperty({ description: 'Comma-separated list of allowed group IDs', example: '1,2,3,9,11,12,13' })
  @IsString()
  @IsNotEmpty()
  allowedGroups: string;

  @ApiProperty({ description: 'Comma-separated list of denied group IDs (optional)', required: false })
  @IsString()
  @IsOptional()
  deniedGroups?: string;
}

export class BoardPermissionInfo {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  categoryName: string;

  @ApiProperty()
  allowedGroups: string;

  @ApiProperty()
  deniedGroups: string;

  @ApiProperty()
  numTopics: number;

  @ApiProperty()
  numPosts: number;
}

export class MemberGroupInfo {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  color: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  memberCount: number;
}

export class ForumPermissionsResponse {
  @ApiProperty({ type: [BoardPermissionInfo] })
  boards: BoardPermissionInfo[];

  @ApiProperty({ type: [MemberGroupInfo] })
  memberGroups: MemberGroupInfo[];
}