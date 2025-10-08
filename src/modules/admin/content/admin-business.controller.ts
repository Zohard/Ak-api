import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  create(@Request() req, @Body() dto: CreateAdminBusinessDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.create(dto, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une fiche business (admin)' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminBusinessDto) {
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
  @ApiOperation({ summary: 'Supprimer une fiche business (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }

  @Post('import-image')
  @ApiOperation({
    summary: 'Import business image to ImageKit',
    description: 'Download and upload a business image from external sources to ImageKit'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL of the image to import' },
        businessName: { type: 'string', description: 'Name of the business for filename generation' }
      },
      required: ['imageUrl', 'businessName']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Image import result'
  })
  async importImage(
    @Body() importData: { imageUrl: string; businessName: string },
  ): Promise<any> {
    return this.service.importBusinessImage(importData.imageUrl, importData.businessName);
  }
}

