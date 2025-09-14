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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
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
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
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

  @Post(':id/staff')
  @ApiOperation({ summary: 'Créer le staff depuis les données d\'import' })
  @ApiResponse({ status: 200, description: 'Staff créé avec succès' })
  createStaffFromImport(
    @Param('id', ParseIntPipe) id: number,
    @Body() staffData: { staff: Array<{ name: string; role: string }> }
  ) {
    return this.service.createStaffFromImportData(id, staffData.staff);
  }

  @ApiOperation({ summary: 'Supprimer un anime (admin)' })
  @ApiResponse({ status: 200, description: 'Anime supprimé' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}