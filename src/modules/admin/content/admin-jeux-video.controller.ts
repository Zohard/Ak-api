import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminJeuxVideoService } from './admin-jeux-video.service';
import { AdminJeuxVideoListQueryDto, CreateAdminJeuxVideoDto, UpdateAdminJeuxVideoDto } from './dto/admin-jeux-video.dto';

@ApiTags('Admin - Jeux Vidéo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/jeux-video')
export class AdminJeuxVideoController {
  constructor(private readonly service: AdminJeuxVideoService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des jeux vidéo (admin)' })
  list(@Query() query: AdminJeuxVideoListQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une fiche jeu vidéo (admin)' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une fiche jeu vidéo (admin)' })
  create(@Request() req, @Body() dto: CreateAdminJeuxVideoDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.create(dto, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une fiche jeu vidéo (admin)' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminJeuxVideoDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.update(id, dto, username);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  updateStatus(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('statut', ParseIntPipe) statut: number) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.updateStatus(id, statut, username);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une fiche jeu vidéo (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get('igdb/search')
  @ApiOperation({ summary: 'Rechercher des jeux sur IGDB' })
  searchIgdb(@Query('query') query: string) {
    return this.service.searchIgdb(query);
  }

  @Post('igdb/import/:igdbId')
  @ApiOperation({ summary: 'Importer un jeu depuis IGDB' })
  importFromIgdb(@Request() req, @Param('igdbId', ParseIntPipe) igdbId: number) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.importFromIgdb(igdbId, username);
  }
}
