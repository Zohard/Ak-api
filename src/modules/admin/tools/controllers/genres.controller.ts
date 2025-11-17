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
import { CreateGenreDto } from '../dto/create-genre.dto';
import { UpdateGenreDto } from '../dto/update-genre.dto';

@ApiTags('Admin - Tools')
@Controller('admin/genres')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class GenresController {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all genres' })
  @ApiResponse({ status: 200, description: 'List of all genres' })
  async findAll() {
    const genres = await this.prisma.akGenre.findMany({
      select: {
        idGenre: true,
        name: true,
        nameFr: true,
        slug: true,
        sortOrder: true,
        createdAt: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    return { genres };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get genre by ID' })
  @ApiResponse({ status: 200, description: 'Genre found' })
  @ApiResponse({ status: 404, description: 'Genre not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const genre = await this.prisma.akGenre.findUnique({
      where: { idGenre: id },
      select: {
        idGenre: true,
        name: true,
        nameFr: true,
        slug: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    if (!genre) {
      throw new Error('Genre not found');
    }

    return genre;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new genre' })
  @ApiResponse({ status: 201, description: 'Genre created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@Body() createGenreDto: CreateGenreDto) {
    const genre = await this.prisma.akGenre.create({
      data: {
        name: createGenreDto.name,
        nameFr: createGenreDto.nameFr || null,
        slug: createGenreDto.slug,
        sortOrder: createGenreDto.sortOrder || 0,
      }
    });

    // Invalidate platforms cache since genres list changed
    await this.cacheService.del('jeux_video:platforms');

    return genre;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a genre' })
  @ApiResponse({ status: 200, description: 'Genre updated successfully' })
  @ApiResponse({ status: 404, description: 'Genre not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateGenreDto: UpdateGenreDto,
  ) {
    const genre = await this.prisma.akGenre.update({
      where: { idGenre: id },
      data: {
        ...(updateGenreDto.name && { name: updateGenreDto.name }),
        ...(updateGenreDto.nameFr !== undefined && { nameFr: updateGenreDto.nameFr || null }),
        ...(updateGenreDto.slug && { slug: updateGenreDto.slug }),
        ...(updateGenreDto.sortOrder !== undefined && { sortOrder: updateGenreDto.sortOrder }),
      }
    });

    // Invalidate platforms cache
    await this.cacheService.del('jeux_video:platforms');

    return genre;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a genre' })
  @ApiResponse({ status: 204, description: 'Genre deleted successfully' })
  @ApiResponse({ status: 404, description: 'Genre not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.akGenre.delete({
      where: { idGenre: id }
    });

    // Invalidate platforms cache
    await this.cacheService.del('jeux_video:platforms');

    return;
  }
}
