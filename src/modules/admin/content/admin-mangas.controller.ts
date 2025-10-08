import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminMangasService } from './admin-mangas.service';
import { AdminMangaListQueryDto, CreateAdminMangaDto, UpdateAdminMangaDto } from './dto/admin-manga.dto';

@ApiTags('Admin - Mangas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/mangas')
export class AdminMangasController {
  constructor(private readonly service: AdminMangasService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des mangas (admin)' })
  list(@Query() query: AdminMangaListQueryDto) { return this.service.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un manga (admin)' })
  getOne(@Param('id', ParseIntPipe) id: number) { return this.service.getOne(id); }

  @Post()
  @ApiOperation({ summary: 'Créer un manga (admin)' })
  create(@Request() req, @Body() dto: CreateAdminMangaDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.create(dto, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un manga (admin)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminMangaDto, @CurrentUser() user: any) { return this.service.update(id, dto, user); }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  updateStatus(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('statut', ParseIntPipe) statut: number) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.updateStatus(id, statut, username);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un manga (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }

  @Post('import-image')
  @ApiOperation({
    summary: 'Import manga image to ImageKit',
    description: 'Download and upload a manga image from AniList/external sources to ImageKit'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL of the image to import' },
        mangaTitle: { type: 'string', description: 'Title of the manga for filename generation' }
      },
      required: ['imageUrl', 'mangaTitle']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Image import result'
  })
  async importImage(
    @Body() importData: { imageUrl: string; mangaTitle: string },
  ): Promise<any> {
    return this.service.importMangaImage(importData.imageUrl, importData.mangaTitle);
  }
}

