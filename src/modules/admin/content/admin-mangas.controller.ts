import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  create(@Body() dto: CreateAdminMangaDto) { return this.service.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un manga (admin)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminMangaDto) { return this.service.update(id, dto); }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('statut', ParseIntPipe) statut: number) { return this.service.updateStatus(id, statut); }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un manga (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}

