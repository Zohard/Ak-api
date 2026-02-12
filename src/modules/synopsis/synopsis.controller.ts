import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
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
} from '@nestjs/swagger';
import { SynopsisService } from './synopsis.service';
import { CreateSynopsisDto } from './dto/create-synopsis.dto';
import { SynopsisQueryDto } from './dto/synopsis-query.dto';
import { ValidateSynopsisDto } from './dto/validate-synopsis.dto';
import { BulkDeleteSynopsisDto } from './dto/bulk-delete-synopsis.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Synopsis')
@Controller('synopsis')
export class SynopsisController {
  constructor(private readonly synopsisService: SynopsisService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soumettre un nouveau synopsis' })
  @ApiResponse({ 
    status: 201, 
    description: 'Synopsis soumis avec succès et en attente de validation',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Synopsis soumis avec succès. Il sera examiné par notre équipe.' },
        data: {
          type: 'object',
          properties: {
            id_synopsis: { type: 'number', example: 123 },
            validation: { type: 'number', example: 0 }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides ou synopsis déjà soumis',
  })
  @ApiResponse({
    status: 404,
    description: 'Anime ou manga introuvable',
  })
  @ApiResponse({
    status: 409,
    description: 'Vous avez déjà soumis un synopsis pour ce contenu',
  })
  async create(@Body() createSynopsisDto: CreateSynopsisDto, @Request() req) {
    return this.synopsisService.create(createSynopsisDto, req.user.id);
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes soumissions de synopsis' })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste de mes soumissions de synopsis',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        submissions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id_synopsis: { type: 'number', example: 123 },
              synopsis: { type: 'string', example: 'Contenu du synopsis...' },
              type: { type: 'number', example: 1, description: '1 = anime, 2 = manga' },
              id_fiche: { type: 'number', example: 456 },
              validation: { type: 'number', example: 0, description: '0 = en attente, 1 = validé, 2 = rejeté' },
              date: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  })
  async getUserSubmissions(@Request() req, @Query() query: SynopsisQueryDto) {
    return this.synopsisService.findUserSubmissions(req.user.id, query);
  }

  @Get('check/:type/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier si l\'utilisateur a déjà soumis un synopsis pour ce contenu' })
  @ApiParam({ name: 'type', description: 'Type de contenu (1 = anime, 2 = manga)', type: 'number' })
  @ApiParam({ name: 'id', description: 'ID du contenu', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statut de la soumission utilisateur',
    schema: {
      type: 'object',
      properties: {
        hasSubmitted: { type: 'boolean', description: 'L\'utilisateur a-t-il déjà soumis un synopsis' }
      }
    }
  })
  async checkUserSubmission(
    @Param('type', ParseIntPipe) type: number,
    @Param('id', ParseIntPipe) contentId: number,
    @Request() req
  ) {
    const hasSubmitted = await this.synopsisService.hasUserSubmitted(req.user.id, type, contentId);
    return { hasSubmitted };
  }

  // Admin endpoints
  @Get('all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir tous les synopsis avec pagination (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée de tous les synopsis',
  })
  async getAllSynopses(
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('validation') validationStr?: string,
    @Query('search') search?: string,
  ) {
    const page = pageStr ? parseInt(pageStr) : 1;
    const limit = limitStr ? parseInt(limitStr) : 20;
    const validation = validationStr !== undefined ? parseInt(validationStr) : undefined;
    return this.synopsisService.findAllSynopses(page, limit, validation, search);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir les synopsis en attente de validation (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Liste des synopsis en attente de validation',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        synopses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id_synopsis: { type: 'number', example: 123 },
              synopsis: { type: 'string', example: 'Contenu du synopsis...' },
              type: { type: 'number', example: 1, description: '1 = anime, 2 = manga' },
              id_fiche: { type: 'number', example: 456 },
              validation: { type: 'number', example: 0, description: '0 = en attente, 1 = validé, 2 = rejeté' },
              date: { type: 'string', format: 'date-time' },
              author_name: { type: 'string', example: 'Nom utilisateur' },
              content_title: { type: 'string', example: 'Titre du contenu' }
            }
          }
        }
      }
    }
  })
  async getPendingSynopses() {
    return this.synopsisService.findPendingSynopses();
  }

  @Patch(':id/update')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un synopsis sans valider (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID du synopsis', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Synopsis mis à jour avec succès',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Synopsis mis à jour avec succès' }
      }
    }
  })
  async updateSynopsis(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateSynopsisDto,
    @Request() req
  ) {
    return this.synopsisService.updateSynopsisOnly(
      id,
      req.user.id,
      dto.editedSynopsis,
      dto.customAuthor
    );
  }

  @Patch(':id/validate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Valider un synopsis (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID du synopsis', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Synopsis validé avec succès',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Synopsis validé et publié' }
      }
    }
  })
  async validateSynopsis(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateSynopsisDto,
    @Request() req
  ) {
    return this.synopsisService.validateSynopsis(
      id,
      1,
      req.user.id,
      dto.editedSynopsis,
      dto.customAuthor
    );
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rejeter un synopsis (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID du synopsis', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Synopsis rejeté avec succès',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Synopsis rejeté' }
      }
    }
  })
  async rejectSynopsis(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.synopsisService.validateSynopsis(id, 2, req.user.id);
  }

  @Post('bulk-delete')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer en masse des synopsis rejetés (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Synopsis rejetés supprimés avec succès',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deletedCount: { type: 'number', example: 10 },
      },
    },
  })
  async bulkDelete(@Body() dto: BulkDeleteSynopsisDto) {
    const result = await this.synopsisService.bulkDelete(dto.ids);
    return {
      success: true,
      ...result,
    };
  }
}