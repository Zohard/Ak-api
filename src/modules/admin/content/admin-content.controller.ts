import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminContentService } from './admin-content.service';
import { ContentAdminQueryDto } from './dto/content-admin-query.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { CreateContentRelationshipDto } from './dto/content-relationship.dto';

@ApiTags('Admin - Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly adminContentService: AdminContentService) {}

  @Get()
  @ApiOperation({ summary: 'Get all content for admin management' })
  @ApiResponse({
    status: 200,
    description: 'Content retrieved successfully with pagination',
    schema: {
      type: 'object',
      properties: {
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              titre: { type: 'string' },
              statut: { type: 'number' },
              date_ajout: { type: 'number' },
              note_moyenne: { type: 'number' },
              nb_critiques: { type: 'number' },
              content_type: { type: 'string' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalItems: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrevious: { type: 'boolean' },
          },
        },
      },
    },
  })
  async findAll(@Query() query: ContentAdminQueryDto) {
    return this.adminContentService.getAllContent(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get content statistics for admin dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Content statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        active_animes: { type: 'number' },
        inactive_animes: { type: 'number' },
        active_mangas: { type: 'number' },
        inactive_mangas: { type: 'number' },
        active_business: { type: 'number' },
        active_articles: { type: 'number' },
        pending_reviews: { type: 'number' },
      },
    },
  })
  async getContentStats() {
    return this.adminContentService.getContentStats();
  }

  @Post('bulk-action')
  @ApiOperation({ summary: 'Perform bulk actions on content' })
  @ApiResponse({ status: 200, description: 'Bulk action completed' })
  @HttpCode(HttpStatus.OK)
  async performBulkAction(
    @Body() bulkActionDto: BulkActionDto,
    @Request() req: any,
  ) {
    return this.adminContentService.performBulkAction(
      bulkActionDto,
      req.user.id,
    );
  }

  @Get(':type/:id')
  @ApiOperation({ summary: 'Get content details for admin management' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga', 'business', 'article'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Content details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async findOne(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminContentService.getContentById(id, type);
  }

  @Put(':type/:id/status')
  @ApiOperation({ summary: 'Update content status' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga', 'business', 'article'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Content status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async updateStatus(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body('status', ParseIntPipe) status: number,
    @Request() req: any,
  ) {
    return this.adminContentService.updateContentStatus(
      id,
      type,
      status,
      req.user.id,
    );
  }
  @Delete('relationships/:relationshipId')
  @ApiOperation({ summary: 'Delete content relationship' })
  @ApiParam({ name: 'relationshipId', description: 'Relationship ID' })
  async deleteRelationship(
    @Param('relationshipId', ParseIntPipe) relationshipId: number,
  ) {
    return this.adminContentService.deleteContentRelationship(relationshipId);
  }

  @Delete(':type/:id')
  @ApiOperation({ summary: 'Delete content (admin only)' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga', 'business', 'article'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Content deleted successfully' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async remove(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.adminContentService.deleteContent(id, type, req.user.id);
  }

  // Relationship management
  @Get(':type/:id/relationships')
  @ApiOperation({ summary: 'Get content relationships' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  async getRelationships(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminContentService.getContentRelationships(id, type);
  }

  @Post(':type/:id/relationships')
  @ApiOperation({ summary: 'Create content relationship' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  async createRelationship(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() relationshipDto: CreateContentRelationshipDto,
  ) {
    return this.adminContentService.createContentRelationship(
      id,
      type,
      relationshipDto,
    );
  }

  @Get('staff-roles/:type')
  @ApiOperation({ summary: 'Get existing staff role types for autocomplete' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search query for role types' })
  @ApiResponse({
    status: 200,
    description: 'Staff role types retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' }
            }
          }
        }
      }
    }
  })
  async getStaffRoleTypes(
    @Param('type') type: string,
    @Query('q') query?: string,
  ) {
    return this.adminContentService.getStaffRoleTypes(type, query);
  }

  // Staff management
  @Get(':type/:id/staff')
  @ApiOperation({ summary: 'Get content staff members' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  async getStaff(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminContentService.getContentStaff(id, type);
  }

  @Post(':type/:id/staff')
  @ApiOperation({ summary: 'Add staff member to content' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  async addStaff(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body('businessId', ParseIntPipe) businessId: number,
    @Body('role') role?: string,
  ) {
    return this.adminContentService.addContentStaff(id, type, businessId, role);
  }

  @Delete(':type/:id/staff/:businessId')
  @ApiOperation({ summary: 'Remove staff member from content' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'role', required: false, description: 'Specific role to remove' })
  async removeStaff(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('businessId', ParseIntPipe) businessId: number,
    @Query('role') role?: string,
  ) {
    return this.adminContentService.removeContentStaff(id, type, businessId, role);
  }

  // Tag management
  @Get(':type/:id/tags')
  @ApiOperation({ summary: 'Get content tags' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  async getTags(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminContentService.getContentTags(id, type);
  }

  @Post(':type/:id/tags')
  @ApiOperation({ summary: 'Add tag to content' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  async addTag(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body('tagId', ParseIntPipe) tagId: number,
  ) {
    return this.adminContentService.addContentTag(id, type, tagId);
  }

  @Delete(':type/:id/tags/:tagId')
  @ApiOperation({ summary: 'Remove tag from content' })
  @ApiParam({
    name: 'type',
    description: 'Content type',
    enum: ['anime', 'manga'],
  })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiParam({ name: 'tagId', description: 'Tag ID' })
  async removeTag(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ) {
    return this.adminContentService.removeContentTag(id, type, tagId);
  }

  @Get('tags/search')
  @ApiOperation({ summary: 'Search tags for autocomplete' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'categorie', required: false, description: 'Filter by category (e.g., Genre)' })
  async searchTags(
    @Query('q') q: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('categorie') categorie?: string,
  ) {
    if (!q || !q.trim()) return { items: [] };
    const lim = limit || 10;
    return this.adminContentService.searchTags(q.trim(), lim, categorie);
  }

}
