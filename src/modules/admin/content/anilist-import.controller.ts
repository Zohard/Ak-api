import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AniListImportService } from './anilist-import.service';

class ImportTagsDto {}

class ImportStaffDto {
  includeVoiceActors?: boolean;
  roles?: string[];
}

class ImportAllDto {
  includeVoiceActors?: boolean;
  staffRoles?: string[];
}

@ApiTags('Admin - AniList Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/animes')
export class AniListImportController {
  constructor(private readonly anilistImportService: AniListImportService) {}

  @Get(':id/anilist-data')
  @ApiOperation({ summary: 'Preview AniList data for an anime (genres, staff, characters)' })
  @ApiResponse({
    status: 200,
    description: 'AniList data preview retrieved successfully',
  })
  async getAniListDataPreview(@Param('id', ParseIntPipe) id: number) {
    return this.anilistImportService.getAniListDataPreview(id);
  }

  @Post(':id/import-tags')
  @ApiOperation({ summary: 'Import tags/genres from AniList data to anime' })
  @ApiResponse({
    status: 200,
    description: 'Tags imported successfully',
  })
  async importTags(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const username = req.user?.pseudo || req.user?.member_name || req.user?.username || 'admin';
    return this.anilistImportService.importTags(id, username);
  }

  @Post(':id/import-staff')
  @ApiOperation({ summary: 'Import staff from AniList data to anime' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        includeVoiceActors: {
          type: 'boolean',
          description: 'Include Japanese voice actors',
          default: false,
        },
        roles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific roles (e.g., ["director", "music"])',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Staff imported successfully',
  })
  async importStaff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ImportStaffDto,
    @Req() req: any,
  ) {
    const username = req.user?.pseudo || req.user?.member_name || req.user?.username || 'admin';
    return this.anilistImportService.importStaff(id, dto, username);
  }

  @Post(':id/import-anilist')
  @ApiOperation({ summary: 'Import both tags and staff from AniList data to anime' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        includeVoiceActors: {
          type: 'boolean',
          description: 'Include Japanese voice actors',
          default: false,
        },
        staffRoles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter staff by specific roles',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'AniList data imported successfully',
  })
  async importAll(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ImportAllDto,
    @Req() req: any,
  ) {
    const username = req.user?.pseudo || req.user?.member_name || req.user?.username || 'admin';
    return this.anilistImportService.importAll(id, dto, username);
  }
}
