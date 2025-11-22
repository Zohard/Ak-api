import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { PrismaService } from '../../../shared/services/prisma.service';

interface TagDto {
  name: string;
  description?: string;
  categorie?: string;
}

@ApiTags('Admin - Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all tags with optional filtering' })
  async list(
    @Query('categorie') categorie?: string,
    @Query('search') search?: string,
  ) {
    let sql = `
      SELECT
        id_tag as "idTag",
        tag_name as name,
        description,
        categorie
      FROM ak_tags
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (categorie) {
      sql += ` AND categorie = $${paramIndex}`;
      params.push(categorie);
      paramIndex++;
    }

    if (search) {
      sql += ` AND tag_name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY categorie, tag_name`;

    const tags = await this.prisma.$queryRawUnsafe(sql, ...params);

    // Get distinct categories for filtering
    const categories = await this.prisma.$queryRaw`
      SELECT DISTINCT categorie
      FROM ak_tags
      WHERE categorie IS NOT NULL
      ORDER BY categorie
    `;

    return { tags, categories };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag by ID' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const rows = await this.prisma.$queryRaw`
      SELECT
        id_tag as "idTag",
        tag_name as name,
        description,
        categorie
      FROM ak_tags
      WHERE id_tag = ${id}
    `;

    const tag = (rows as any[])[0];
    if (!tag) {
      return { error: 'Tag not found' };
    }

    return { tag };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tag' })
  async create(@Body() dto: TagDto) {
    const { name, description, categorie } = dto;

    // Check if tag already exists
    const existing = await this.prisma.$queryRaw`
      SELECT id_tag FROM ak_tags WHERE tag_name = ${name} LIMIT 1
    `;

    if ((existing as any[]).length > 0) {
      return { error: 'A tag with this name already exists' };
    }

    await this.prisma.$queryRaw`
      INSERT INTO ak_tags (tag_name, description, categorie)
      VALUES (${name}, ${description || null}, ${categorie || null})
    `;

    return { message: 'Tag created successfully' };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a tag' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: TagDto) {
    const { name, description, categorie } = dto;

    // Check if tag exists
    const existing = await this.prisma.$queryRaw`
      SELECT id_tag FROM ak_tags WHERE id_tag = ${id}
    `;

    if ((existing as any[]).length === 0) {
      return { error: 'Tag not found' };
    }

    // Check for duplicate name (excluding current tag)
    const duplicate = await this.prisma.$queryRaw`
      SELECT id_tag FROM ak_tags WHERE tag_name = ${name} AND id_tag != ${id} LIMIT 1
    `;

    if ((duplicate as any[]).length > 0) {
      return { error: 'A tag with this name already exists' };
    }

    await this.prisma.$queryRaw`
      UPDATE ak_tags
      SET tag_name = ${name}, description = ${description || null}, categorie = ${categorie || null}
      WHERE id_tag = ${id}
    `;

    return { message: 'Tag updated successfully' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tag' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    // Check if tag is in use
    const usageCount = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count FROM ak_tag2fiche WHERE id_tag = ${id}
    `;

    const count = Number((usageCount as any[])[0]?.count || 0);
    if (count > 0) {
      return {
        error: `Cannot delete: this tag is used by ${count} anime/manga`,
        count,
      };
    }

    await this.prisma.$queryRaw`
      DELETE FROM ak_tags WHERE id_tag = ${id}
    `;

    return { message: 'Tag deleted successfully' };
  }
}
