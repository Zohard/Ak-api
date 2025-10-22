import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des critiques avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des critiques' })
  async findAll(@Query() query: ReviewQueryDto) {
    return this.reviewsService.findAll(query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Nombre total de critiques' })
  @ApiResponse({ status: 200, description: 'Nombre de critiques' })
  async getReviewsCount() {
    return this.reviewsService.getReviewsCount();
  }

  @Get('top')
  @ApiOperation({ summary: 'Top critiques les plus utiles' })
  @ApiResponse({ status: 200, description: 'Liste des meilleures critiques' })
  async getTopReviews(
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('type') type?: 'anime' | 'manga' | 'both',
  ) {
    return this.reviewsService.getTopReviews(limit, type);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "Critiques d'un utilisateur" })
  @ApiParam({
    name: 'userId',
    description: "ID de l'utilisateur",
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: "Liste des critiques de l'utilisateur",
  })
  async getUserReviews(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit', ParseIntPipe) limit = 20,
    @Request() req?,
  ) {
    // Pass requesting user ID if authenticated (to show unpublished reviews for own profile)
    const requestingUserId = req?.user?.id;
    return this.reviewsService.getUserReviews(userId, limit, requestingUserId);
  }

  @Get('my-reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes critiques' })
  @ApiResponse({ status: 200, description: 'Liste de mes critiques' })
  async getMyReviews(@Request() req, @Query('limit', ParseIntPipe) limit = 20) {
    // Pass user ID as requesting user to show all reviews including unpublished
    return this.reviewsService.getUserReviews(req.user.id, limit, req.user.id);
  }

  @Get('check/:type/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier si l\'utilisateur a déjà une critique pour ce contenu' })
  @ApiParam({ name: 'type', description: 'Type de contenu (anime ou manga)', enum: ['anime', 'manga'] })
  @ApiParam({ name: 'id', description: 'ID du contenu', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statut de la critique utilisateur',
    schema: {
      type: 'object',
      properties: {
        hasReview: { type: 'boolean', description: 'L\'utilisateur a-t-il déjà une critique' },
        review: { 
          type: 'object', 
          nullable: true, 
          description: 'Données de la critique existante si elle existe' 
        }
      }
    }
  })
  async checkUserReview(
    @Param('type') type: 'anime' | 'manga',
    @Param('id', ParseIntPipe) contentId: number,
    @Request() req
  ) {
    return this.reviewsService.checkUserReview(req.user.id, type, contentId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une nouvelle critique' })
  @ApiResponse({ status: 201, description: 'Critique créée avec succès' })
  @ApiResponse({
    status: 400,
    description: 'Données invalides ou critique déjà existante',
  })
  async create(@Body() createReviewDto: CreateReviewDto, @Request() req) {
    return this.reviewsService.create(createReviewDto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une critique par ID' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Détails de la critique' })
  @ApiResponse({ status: 404, description: 'Critique introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.reviewsService.findOne(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Récupérer une critique par slug (niceUrl)' })
  @ApiParam({ name: 'slug', description: 'Slug de la critique', type: 'string' })
  @ApiResponse({ status: 200, description: 'Détails de la critique' })
  @ApiResponse({ status: 404, description: 'Critique introuvable' })
  async findBySlug(@Param('slug') slug: string) {
    return this.reviewsService.findBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Critique mise à jour avec succès' })
  @ApiResponse({
    status: 403,
    description: 'Vous ne pouvez modifier que vos propres critiques',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateReviewDto: UpdateReviewDto,
    @Request() req,
  ) {
    return this.reviewsService.update(
      id,
      updateReviewDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 204, description: 'Critique supprimée avec succès' })
  @ApiResponse({
    status: 403,
    description: 'Vous ne pouvez supprimer que vos propres critiques',
  })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.reviewsService.remove(id, req.user.id, req.user.isAdmin);
  }

  // Admin endpoints
  @Patch(':id/validate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Valider une critique (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Critique validée avec succès' })
  async validateReview(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.reviewsService.update(id, { statut: 1 }, req.user.id, true);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refuser une critique (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Critique refusée avec succès' })
  async rejectReview(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.reviewsService.update(id, { statut: 2 }, req.user.id, true);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Incrémenter les vues/popularité d\'une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Popularité mise à jour avec succès' })
  @ApiResponse({ status: 404, description: 'Critique introuvable' })
  async incrementViews(@Param('id', ParseIntPipe) id: number, @Request() req) {
    // Pass user ID to avoid self-increment (optional)
    const userId = req.user?.id || null;
    return this.reviewsService.incrementViews(id, userId);
  }

  @Post(':id/rate/:type')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Évaluer une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiParam({ name: 'type', description: 'Type d\'évaluation (c|a|o|y|n)', enum: ['c', 'a', 'o', 'y', 'n'] })
  @ApiResponse({ status: 200, description: 'Évaluation mise à jour avec succès' })
  @ApiResponse({ status: 404, description: 'Critique introuvable' })
  @ApiResponse({ status: 403, description: 'Impossible d\'évaluer sa propre critique' })
  async rateReview(
    @Param('id', ParseIntPipe) id: number, 
    @Param('type') type: 'c' | 'a' | 'o' | 'y' | 'n',
    @Request() req
  ) {
    return this.reviewsService.rateReview(id, req.user.id, type);
  }

  @Get(':id/ratings')
  @ApiOperation({ summary: 'Récupérer les évaluations d\'une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Évaluations de la critique' })
  @ApiResponse({ status: 404, description: 'Critique introuvable' })
  async getReviewRatings(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const userId = req.user?.id || null;
    return this.reviewsService.getReviewRatings(id, userId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Statistiques d\'une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({ status: 200, description: 'Statistiques de la critique' })
  @ApiResponse({ status: 404, description: 'Critique introuvable' })
  async getReviewStats(@Param('id', ParseIntPipe) id: number) {
    const stats = await this.reviewsService.getReviewStats(id);
    // Wrap to match frontend expectations: { success, data }
    return { success: true, data: stats } as any;
  }
}
