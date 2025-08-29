import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminBusinessService } from './admin-business.service';
import { AdminBusinessListQueryDto, CreateAdminBusinessDto, UpdateAdminBusinessDto } from './dto/admin-business.dto';

@ApiTags('Admin - Business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/business')
export class AdminBusinessController {
  constructor(private readonly service: AdminBusinessService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des business (admin)' })
  list(@Query() query: AdminBusinessListQueryDto) { return this.service.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une fiche business (admin)' })
  getOne(@Param('id', ParseIntPipe) id: number) { return this.service.getOne(id); }

  @Post()
  @ApiOperation({ summary: 'Créer une fiche business (admin)' })
  create(@Body() dto: CreateAdminBusinessDto) { return this.service.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une fiche business (admin)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminBusinessDto) { return this.service.update(id, dto); }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('statut', ParseIntPipe) statut: number) { return this.service.updateStatus(id, statut); }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une fiche business (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}

