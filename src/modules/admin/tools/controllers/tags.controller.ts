import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../../common/guards/admin.guard';
import { PrismaService } from '../../../../shared/services/prisma.service';
import { CacheService } from '../../../../shared/services/cache.service';
import { CreateTagDto } from '../dto/create-tag.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';

@ApiTags('Admin - Tools')
@Controller('admin/tags')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class TagsController {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all tags' })
  @ApiResponse({ status: 200, description: 'List of all tags' })
  async findAll() {
    const tags = await this.prisma.akTag.findMany({
      select: {
        idTag: true,
        tagName: true,
        tagNiceUrl: true,
        description: true,
        categorie: true,
      },
      orderBy: [
        { categorie: 'asc' },
        { tagName: 'asc' }
      ]
    });

    return { tags };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tag by ID' })
  @ApiResponse({ status: 200, description: 'Tag found' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const tag = await this.prisma.akTag.findUnique({
      where: { idTag: id },
      select: {
        idTag: true,
        tagName: true,
        tagNiceUrl: true,
        description: true,
        categorie: true,
      },
    });

    if (!tag) {
      throw new Error('Tag not found');
    }

    return tag;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@Body() createTagDto: CreateTagDto) {
    const tag = await this.prisma.akTag.create({
      data: {
        tagName: createTagDto.tagName,
        tagNiceUrl: createTagDto.tagNiceUrl || null,
        description: createTagDto.description || null,
        categorie: createTagDto.categorie || null,
      }
    });

    // Invalidate tags cache
    await this.cacheService.del('ak_tags:all');

    return tag;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, description: 'Tag updated successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    const tag = await this.prisma.akTag.update({
      where: { idTag: id },
      data: {
        ...(updateTagDto.tagName && { tagName: updateTagDto.tagName }),
        ...(updateTagDto.tagNiceUrl !== undefined && { tagNiceUrl: updateTagDto.tagNiceUrl || null }),
        ...(updateTagDto.description !== undefined && { description: updateTagDto.description || null }),
        ...(updateTagDto.categorie !== undefined && { categorie: updateTagDto.categorie || null }),
      }
    });

    // Invalidate tags cache
    await this.cacheService.del('ak_tags:all');

    return tag;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 204, description: 'Tag deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.akTag.delete({
      where: { idTag: id }
    });

    // Invalidate tags cache
    await this.cacheService.del('ak_tags:all');

    return;
  }
}
