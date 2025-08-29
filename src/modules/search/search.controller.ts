import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UnifiedSearchService } from '../../shared/services/unified-search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: UnifiedSearchService) {}

  @Get()
  @ApiOperation({ summary: 'Recherche unifiée dans animes et mangas' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Terme de recherche',
    example: 'naruto',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Type de contenu',
    enum: ['anime', 'manga', 'all'],
    example: 'all',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de résultats',
    example: 20,
  })
  @ApiQuery({
    name: 'minRating',
    required: false,
    description: 'Note minimum',
    example: 7.0,
  })
  @ApiQuery({
    name: 'yearFrom',
    required: false,
    description: 'Année minimum',
    example: 2000,
  })
  @ApiQuery({
    name: 'yearTo',
    required: false,
    description: 'Année maximum',
    example: 2024,
  })
  @ApiQuery({
    name: 'genre',
    required: false,
    description: 'Genre',
    example: 'action',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Critère de tri',
    enum: ['relevance', 'rating', 'date', 'title'],
    example: 'relevance',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Ordre de tri',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Statut du contenu',
    enum: ['ongoing', 'completed', 'all'],
    example: 'all',
  })
  @ApiResponse({
    status: 200,
    description: 'Résultats de recherche unifiés avec analytiques',
  })
  async unifiedSearch(
    @Query('q') query: string,
    @Query('type') type?: 'anime' | 'manga' | 'all',
    @Query('limit') limit?: string,
    @Query('minRating') minRating?: string,
    @Query('yearFrom') yearFrom?: string,
    @Query('yearTo') yearTo?: string,
    @Query('genre') genre?: string,
    @Query('sortBy') sortBy?: 'relevance' | 'rating' | 'date' | 'title',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('status') status?: 'ongoing' | 'completed' | 'all',
  ) {
    const searchQuery = {
      query,
      type: type || 'all',
      limit: limit ? parseInt(limit) : 20,
      minRating: minRating ? parseFloat(minRating) : 0,
      yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
      yearTo: yearTo ? parseInt(yearTo) : undefined,
      genre,
      sortBy: sortBy || 'relevance',
      sortOrder: sortOrder || 'desc',
      status: status || 'all',
    };

    return this.searchService.search(searchQuery);
  }

  @Get('recommendations/:type/:id')
  @ApiOperation({ summary: 'Recommandations basées sur un anime ou manga' })
  @ApiParam({
    name: 'type',
    description: 'Type de contenu',
    enum: ['anime', 'manga'],
    example: 'anime',
  })
  @ApiParam({
    name: 'id',
    description: 'ID du contenu de base',
    type: 'number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de recommandations',
    example: 10,
  })
  @ApiResponse({ status: 200, description: 'Recommandations personnalisées' })
  async getRecommendations(
    @Param('type') type: 'anime' | 'manga',
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.searchService.getRecommendations(id, type, parsedLimit);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocomplétion de recherche' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Terme de recherche partiel',
    example: 'naru',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Type de contenu',
    enum: ['anime', 'manga', 'all'],
    example: 'all',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de suggestions',
    example: 10,
  })
  @ApiResponse({ status: 200, description: "Suggestions d'autocomplétion" })
  async getAutocomplete(
    @Query('q') query: string,
    @Query('type') type?: 'anime' | 'manga' | 'all',
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.searchService.getAutocomplete(query, type, parsedLimit);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Recherches populaires du moment' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de recherches populaires',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Recherches populaires avec compteurs',
  })
  async getPopularSearches(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.searchService.getPopularSearches(parsedLimit);
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Analytiques de recherche (Admin uniquement)' })
  @ApiResponse({
    status: 200,
    description: 'Statistiques détaillées des recherches',
  })
  @ApiBearerAuth()
  async getSearchAnalytics() {
    return this.searchService.getSearchAnalytics();
  }
}
