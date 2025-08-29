import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminAnimesService } from './admin-animes.service';
import {
  AdminAnimeListQueryDto,
  CreateAdminAnimeDto,
  UpdateAdminAnimeDto,
} from './dto/admin-anime.dto';

@ApiTags('Admin - Animes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/animes')
export class AdminAnimesController {
  constructor(private readonly service: AdminAnimesService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des animes (admin)' })
  @ApiResponse({ status: 200, description: 'Liste avec pagination' })
  list(@Query() query: AdminAnimeListQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un anime (admin)' })
  @ApiResponse({ status: 201, description: 'Anime créé' })
  create(@Body() dto: CreateAdminAnimeDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un anime (admin)' })
  @ApiResponse({ status: 200, description: 'Anime' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un anime (admin)' })
  @ApiResponse({ status: 200, description: 'Anime mis à jour' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminAnimeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('statut', ParseIntPipe) statut: number,
  ) {
    return this.service.updateStatus(id, statut);
  }

  @ApiOperation({ summary: 'Supprimer un anime (admin)' })
  @ApiResponse({ status: 200, description: 'Anime supprimé' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}