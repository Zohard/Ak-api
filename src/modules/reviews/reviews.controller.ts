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
  ) {
    return this.reviewsService.getUserReviews(userId, limit);
  }

  @Get('my-reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes critiques' })
  @ApiResponse({ status: 200, description: 'Liste de mes critiques' })
  async getMyReviews(@Request() req, @Query('limit', ParseIntPipe) limit = 20) {
    return this.reviewsService.getUserReviews(req.user.id, limit);
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
}
