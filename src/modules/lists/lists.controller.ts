import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { UpdateItemsDto } from './dto/update-items.dto';

@ApiTags('lists')
@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) { }

  // GET /lists/:userId
  @Get(':userId')
  @ApiOperation({ summary: "Listes d'un utilisateur" })
  @ApiParam({ name: 'userId', type: 'number' })
  @ApiQuery({ name: 'type', required: false, enum: ['liste', 'top'] })
  @ApiQuery({ name: 'mediaType', required: false, enum: ['anime', 'manga', 'jeu-video'] })
  getUserLists(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('type') type?: 'liste' | 'top',
    @Query('mediaType') mediaType?: 'anime' | 'manga' | 'jeu-video',
  ) {
    return this.listsService.getUserLists(userId, type, mediaType);
  }

  // POST /lists
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer nouvelle liste/top' })
  create(@Body() dto: CreateListDto, @Request() req) {
    return this.listsService.createList(req.user.id, dto);
  }

  // PUT /lists/:id
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier liste/top' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateListDto,
    @Request() req,
  ) {
    return this.listsService.updateList(id, req.user.id, dto);
  }

  // DELETE /lists/:id
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer liste/top' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    await this.listsService.deleteList(id, req.user.id);
    return;
  }

  // PUT /lists/:id/items
  @Put(':id/items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier ordre/contenu (drag & drop)' })
  updateItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateItemsDto,
    @Request() req,
  ) {
    return this.listsService.updateItems(id, req.user.id, body.items, body.comments);
  }

  // GET /lists/public/recent/:mediaType
  @Get('public/recent/:mediaType')
  @ApiOperation({ summary: 'Listes récentes publiques' })
  @ApiParam({ name: 'mediaType', enum: ['anime', 'manga', 'jeu-video'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getRecent(
    @Param('mediaType') mediaType: 'anime' | 'manga' | 'jeu-video',
    @Query('limit') limit = '10',
  ) {
    return this.listsService.getPublicLists(mediaType, 'recent', parseInt(limit));
  }

  // GET /lists/public/popular/:mediaType
  @Get('public/popular/:mediaType')
  @ApiOperation({ summary: 'Listes populaires publiques' })
  @ApiParam({ name: 'mediaType', enum: ['anime', 'manga', 'jeu-video'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getPopular(
    @Param('mediaType') mediaType: 'anime' | 'manga' | 'jeu-video',
    @Query('limit') limit = '10',
  ) {
    return this.listsService.getPublicLists(mediaType, 'popular', parseInt(limit));
  }

  // GET /lists/:id/stats
  @Get(':id/stats')
  @ApiOperation({ summary: "Stats d'une liste" })
  getStats(@Param('id', ParseIntPipe) id: number) {
    return this.listsService.stats(id);
  }

  // GET /lists/:id/votes - Get real-time vote counts (uncached)
  @Get(':id/votes')
  @ApiOperation({ summary: 'Obtenir les votes en temps réel (non mis en cache)' })
  getVotes(@Param('id', ParseIntPipe) id: number) {
    return this.listsService.getVotes(id);
  }

  // GET /lists/id/:id - fetch by ID (avoid conflict with /lists/:userId)
  @Get('id/:id')
  @ApiOperation({ summary: 'Obtenir une liste par ID' })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.listsService.getById(id);
  }

  // PUT /lists/:id/view
  @Put(':id/view')
  @ApiOperation({ summary: 'Incrémenter nb_clics' })
  incrementView(@Param('id', ParseIntPipe) id: number) {
    return this.listsService.incrementView(id);
  }

  // POST /lists/:id/like
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  like(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.listsService.like(id, req.user.id);
  }

  // POST /lists/:id/dislike
  @Post(':id/dislike')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  dislike(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.listsService.dislike(id, req.user.id);
  }

  // DELETE /lists/:id/like
  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  removeLike(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.listsService.removeLike(id, req.user.id);
  }

  // DELETE /lists/:id/dislike
  @Delete(':id/dislike')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  removeDislike(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.listsService.removeDislike(id, req.user.id);
  }
  @Get('public/browse/:mediaType')
  @ApiOperation({ summary: 'Parcourir les listes publiques avec pagination' })
  @ApiParam({ name: 'mediaType', enum: ['anime', 'manga', 'jeu-video'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['recent', 'popular'] })
  @ApiQuery({ name: 'type', required: false, enum: ['liste', 'top'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  browsePublic(
    @Param('mediaType') mediaType: 'anime' | 'manga' | 'jeu-video',
    @Query('sort') sort: 'recent' | 'popular' = 'recent',
    @Query('type') type?: 'liste' | 'top',
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.listsService.getPublicListsPaged(
      mediaType,
      sort,
      type,
      Math.max(parseInt(String(page)) || 1, 1),
      Math.min(Math.max(parseInt(String(limit)) || 30, 1), 100),
    );
  }

  @Get('media/:mediaType/:mediaId')
  @ApiOperation({ summary: 'Obtenir les listes contenant un média spécifique' })
  @ApiParam({ name: 'mediaType', enum: ['anime', 'manga', 'jeu-video'] })
  @ApiParam({ name: 'mediaId', type: 'number' })
  getListsByMedia(
    @Param('mediaType') mediaType: 'anime' | 'manga' | 'jeu-video',
    @Param('mediaId', ParseIntPipe) mediaId: number,
  ) {
    return this.listsService.getListsByMedia(mediaType, mediaId);
  }

  // POST /lists/recalculate-popularity - Admin utility endpoint
  @Post('recalculate-popularity')
  @ApiOperation({ summary: 'Recalculer la popularité de toutes les listes (admin)' })
  @ApiResponse({ status: 200, description: 'Popularité recalculée avec succès' })
  recalculatePopularity() {
    return this.listsService.recalculateAllPopularity();
  }

}
