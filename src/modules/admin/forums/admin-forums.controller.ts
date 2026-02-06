import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminForumsService } from './admin-forums.service';
import {
  UpdateBoardPermissionsDto,
  ForumPermissionsResponse,
  BoardPermissionInfo
} from './dto/forum-permissions.dto';

@ApiTags('Admin - Forums')
@Controller('admin/forums')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'moderator')
@ApiBearerAuth()
export class AdminForumsController {
  constructor(private readonly adminForumsService: AdminForumsService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Get all forum boards with their permission settings' })
  @ApiResponse({
    status: 200,
    description: 'Forum permissions retrieved successfully',
    type: ForumPermissionsResponse
  })
  async getForumPermissions(): Promise<ForumPermissionsResponse> {
    return this.adminForumsService.getForumPermissions();
  }

  @Get('boards')
  @ApiOperation({ summary: 'Get all forum boards with permissions' })
  @ApiResponse({
    status: 200,
    description: 'Boards retrieved successfully',
    type: [BoardPermissionInfo]
  })
  async getBoards(): Promise<BoardPermissionInfo[]> {
    return this.adminForumsService.getBoardsWithPermissions();
  }

  @Get('member-groups')
  @ApiOperation({ summary: 'Get all member groups' })
  @ApiResponse({ status: 200, description: 'Member groups retrieved successfully' })
  async getMemberGroups() {
    return this.adminForumsService.getMemberGroups();
  }

  @Get('permission-templates')
  @ApiOperation({ summary: 'Get quick permission templates' })
  @ApiResponse({ status: 200, description: 'Permission templates retrieved successfully' })
  async getPermissionTemplates() {
    return this.adminForumsService.getQuickPermissionTemplates();
  }

  @Get('boards/:boardId/permissions')
  @ApiOperation({ summary: 'Get detailed permission info for a specific board' })
  @ApiParam({ name: 'boardId', type: 'number', description: 'Board ID' })
  @ApiResponse({ status: 200, description: 'Board permission details retrieved successfully' })
  async getBoardPermissions(@Param('boardId', ParseIntPipe) boardId: number) {
    return this.adminForumsService.getBoardPermissionSummary(boardId);
  }

  @Put('boards/:boardId/permissions')
  @ApiOperation({ summary: 'Update board permissions' })
  @ApiParam({ name: 'boardId', type: 'number', description: 'Board ID' })
  @ApiBody({ type: UpdateBoardPermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'Board permissions updated successfully',
    type: BoardPermissionInfo
  })
  @HttpCode(HttpStatus.OK)
  async updateBoardPermissions(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() updateDto: Omit<UpdateBoardPermissionsDto, 'boardId'>
  ): Promise<BoardPermissionInfo> {
    return this.adminForumsService.updateBoardPermissions({
      boardId,
      ...updateDto
    });
  }

  @Post('boards/:boardId/apply-template/:templateName')
  @ApiOperation({ summary: 'Apply a quick permission template to a board' })
  @ApiParam({ name: 'boardId', type: 'number', description: 'Board ID' })
  @ApiParam({
    name: 'templateName',
    type: 'string',
    description: 'Template name',
    enum: ['public', 'membersOnly', 'staffOnly', 'adminOnly', 'teamAK']
  })
  @ApiResponse({
    status: 200,
    description: 'Permission template applied successfully',
    type: BoardPermissionInfo
  })
  @HttpCode(HttpStatus.OK)
  async applyPermissionTemplate(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('templateName') templateName: string
  ): Promise<BoardPermissionInfo> {
    return this.adminForumsService.applyPermissionTemplate(boardId, templateName);
  }

  @Post('boards/bulk-permissions')
  @ApiOperation({ summary: 'Update permissions for multiple boards at once' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        boardIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of board IDs'
        },
        allowedGroups: {
          type: 'string',
          description: 'Comma-separated list of allowed group IDs'
        },
        deniedGroups: {
          type: 'string',
          description: 'Comma-separated list of denied group IDs'
        }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Bulk permissions updated successfully' })
  @HttpCode(HttpStatus.OK)
  async updateBulkPermissions(
    @Body() bulkDto: {
      boardIds: number[];
      allowedGroups: string;
      deniedGroups?: string;
    }
  ): Promise<BoardPermissionInfo[]> {
    const results = await Promise.all(
      bulkDto.boardIds.map(boardId =>
        this.adminForumsService.updateBoardPermissions({
          boardId,
          allowedGroups: bulkDto.allowedGroups,
          deniedGroups: bulkDto.deniedGroups
        })
      )
    );

    return results;
  }

  @Post('recompute-last-messages')
  @ApiOperation({ summary: 'Recompute id_last_msg and id_first_msg on all topics and boards based on actual messages' })
  @ApiResponse({ status: 200, description: 'Last messages recomputed successfully' })
  @HttpCode(HttpStatus.OK)
  async recomputeLastMessages() {
    return this.adminForumsService.recomputeLastMessages();
  }

  @Post('boards/bulk-template/:templateName')
  @ApiOperation({ summary: 'Apply a template to multiple boards at once' })
  @ApiParam({
    name: 'templateName',
    type: 'string',
    description: 'Template name',
    enum: ['public', 'membersOnly', 'staffOnly', 'adminOnly', 'teamAK']
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        boardIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of board IDs'
        }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Bulk template applied successfully' })
  @HttpCode(HttpStatus.OK)
  async applyBulkTemplate(
    @Param('templateName') templateName: string,
    @Body() bulkDto: { boardIds: number[] }
  ): Promise<BoardPermissionInfo[]> {
    const results = await Promise.all(
      bulkDto.boardIds.map(boardId =>
        this.adminForumsService.applyPermissionTemplate(boardId, templateName)
      )
    );

    return results;
  }
}