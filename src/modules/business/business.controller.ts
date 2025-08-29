import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessQueryDto } from './dto/business-query.dto';
import { BusinessSearchDto } from './dto/business-search.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Business')
@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('search')
  @ApiOperation({
    summary: "Recherche d'entités business (pas d'auth requise)",
    description:
      'Endpoint public pour rechercher des entités business par dénomination',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Terme de recherche',
    example: 'pierrot',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre maximum de résultats',
    example: 10,
  })
  @ApiResponse({ status: 200, description: 'Résultats de recherche business' })
  async search(@Query() searchDto: BusinessSearchDto) {
    return this.businessService.search(searchDto);
  }

  @Post(':id/clicks')
  @ApiOperation({
    summary:
      "Incrémenter les clics sur une entité business (pas d'auth requise)",
    description:
      "Endpoint public pour incrémenter le compteur de clics d'une entité business",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Type de clic (day, week, month)',
    example: 'day',
  })
  @ApiResponse({ status: 200, description: 'Clics incrémentés avec succès' })
  @HttpCode(HttpStatus.OK)
  async incrementClicks(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') clickType?: 'day' | 'week' | 'month',
  ) {
    return this.businessService.incrementClicks(id, clickType);
  }

  @Get()
  @ApiOperation({
    summary: 'Liste de toutes les entités business',
    description:
      "Récupère la liste des entités business comme les studios d'animation, auteurs, éditeurs, etc.",
  })
  @ApiResponse({ status: 200, description: 'Liste des entités business' })
  async findAll(@Query() query: BusinessQueryDto) {
    return this.businessService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer une nouvelle entité business (Admin seulement)',
    description:
      "Créer une nouvelle entité business comme un studio d'animation, auteur, éditeur, etc.",
  })
  @ApiResponse({
    status: 201,
    description: 'Entité business créée avec succès',
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès admin requis' })
  async create(@Body() createBusinessDto: CreateBusinessDto) {
    return this.businessService.create(createBusinessDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer une entité business spécifique par ID',
    description: "Récupère les détails d'une entité business spécifique",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({ status: 200, description: "Détails de l'entité business" })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.businessService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mettre à jour une entité business (Admin seulement)',
    description: "Met à jour les informations d'une entité business",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Entité business mise à jour avec succès',
  })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  @ApiResponse({ status: 403, description: 'Accès admin requis' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBusinessDto: UpdateBusinessDto,
  ) {
    return this.businessService.update(id, updateBusinessDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer une entité business (Admin seulement)',
    description: 'Supprime définitivement une entité business',
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({
    status: 204,
    description: 'Entité business supprimée avec succès',
  })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  @ApiResponse({ status: 403, description: 'Accès admin requis' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.businessService.remove(id);
  }
}
