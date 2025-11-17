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
import { CreatePlatformDto } from '../dto/create-platform.dto';
import { UpdatePlatformDto } from '../dto/update-platform.dto';

@ApiTags('Admin - Tools')
@Controller('admin/platforms')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class PlatformsController {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all platforms' })
  @ApiResponse({ status: 200, description: 'List of all platforms' })
  async findAll() {
    const platforms = await this.prisma.akPlatform.findMany({
      select: {
        idPlatform: true,
        name: true,
        shortName: true,
        manufacturer: true,
        generation: true,
        releaseYear: true,
        platformType: true,
        sortOrder: true,
        createdAt: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    return { platforms };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get platform by ID' })
  @ApiResponse({ status: 200, description: 'Platform found' })
  @ApiResponse({ status: 404, description: 'Platform not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const platform = await this.prisma.akPlatform.findUnique({
      where: { idPlatform: id },
      select: {
        idPlatform: true,
        name: true,
        shortName: true,
        manufacturer: true,
        generation: true,
        releaseYear: true,
        platformType: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    if (!platform) {
      throw new Error('Platform not found');
    }

    return platform;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new platform' })
  @ApiResponse({ status: 201, description: 'Platform created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@Body() createPlatformDto: CreatePlatformDto) {
    const platform = await this.prisma.akPlatform.create({
      data: {
        name: createPlatformDto.name,
        shortName: createPlatformDto.shortName || null,
        manufacturer: createPlatformDto.manufacturer || null,
        generation: createPlatformDto.generation || null,
        releaseYear: createPlatformDto.releaseYear || null,
        platformType: createPlatformDto.platformType || null,
        sortOrder: createPlatformDto.sortOrder || 0,
      }
    });

    // Invalidate platforms cache since platforms list changed
    await this.cacheService.del('jeux_video:platforms');

    return platform;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a platform' })
  @ApiResponse({ status: 200, description: 'Platform updated successfully' })
  @ApiResponse({ status: 404, description: 'Platform not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePlatformDto: UpdatePlatformDto,
  ) {
    const platform = await this.prisma.akPlatform.update({
      where: { idPlatform: id },
      data: {
        ...(updatePlatformDto.name && { name: updatePlatformDto.name }),
        ...(updatePlatformDto.shortName !== undefined && { shortName: updatePlatformDto.shortName || null }),
        ...(updatePlatformDto.manufacturer !== undefined && { manufacturer: updatePlatformDto.manufacturer || null }),
        ...(updatePlatformDto.generation !== undefined && { generation: updatePlatformDto.generation || null }),
        ...(updatePlatformDto.releaseYear !== undefined && { releaseYear: updatePlatformDto.releaseYear }),
        ...(updatePlatformDto.platformType !== undefined && { platformType: updatePlatformDto.platformType || null }),
        ...(updatePlatformDto.sortOrder !== undefined && { sortOrder: updatePlatformDto.sortOrder }),
      }
    });

    // Invalidate platforms cache
    await this.cacheService.del('jeux_video:platforms');

    return platform;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a platform' })
  @ApiResponse({ status: 204, description: 'Platform deleted successfully' })
  @ApiResponse({ status: 404, description: 'Platform not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.akPlatform.delete({
      where: { idPlatform: id }
    });

    // Invalidate platforms cache
    await this.cacheService.del('jeux_video:platforms');

    return;
  }
}
