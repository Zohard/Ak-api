import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { AddAnimeToCollectionDto } from './dto/add-anime-to-collection.dto';
import { AddMangaToCollectionDto } from './dto/add-manga-to-collection.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user collections by userId' })
  @ApiResponse({ status: 200, description: 'Collections retrieved successfully' })
  @ApiQuery({ name: 'userId', required: true, type: Number, description: 'User ID' })
  findUserCollections(@Query('userId', ParseIntPipe) userId: number, @Request() req) {
    const currentUserId = req.user?.id;
    return this.collectionsService.findUserCollections(userId, currentUserId);
  }

  @Get('browse')
  @ApiOperation({ summary: 'Browse all users with public collections' })
  @ApiResponse({ status: 200, description: 'User collections retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by username' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by field' })
  browseUserCollections(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search: string = '',
    @Query('sortBy') sortBy: string = '',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.browseUserCollections(
      parseInt(page),
      parseInt(limit),
      search || undefined,
      sortBy || undefined,
      currentUserId,
    );
  }

  @Get('user/:userId/type/:type')
  @ApiOperation({ summary: 'Get collection details by user and type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiResponse({ status: 200, description: 'Collection retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  findCollectionByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Request() req
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.findCollectionByType(userId, type, currentUserId);
  }

  // Anime collection routes
  @Get('user/:userId/type/:type/animes')
  @ApiOperation({ summary: 'Get animes from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Collection animes retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  getCollectionAnimes(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getCollectionAnimes(userId, type, parseInt(page), parseInt(limit), currentUserId);
  }

  @Post('user/:userId/type/:type/animes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add anime to user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiResponse({ status: 201, description: 'Anime added to collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Anime not found' })
  @ApiResponse({ status: 409, description: 'Anime already in collection' })
  addAnimeToCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Body() addAnimeDto: AddAnimeToCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.addAnimeToCollection(userId, type, addAnimeDto, req.user.id);
  }

  @Delete('user/:userId/type/:type/animes/:animeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove anime from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiParam({ name: 'animeId', type: 'number', description: 'Anime ID' })
  @ApiResponse({ status: 200, description: 'Anime removed from collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Anime not found in collection' })
  removeAnimeFromCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Param('animeId', ParseIntPipe) animeId: number,
    @Request() req,
  ) {
    return this.collectionsService.removeAnimeFromCollection(userId, type, animeId, req.user.id);
  }

  // Manga collection routes
  @Get('user/:userId/type/:type/mangas')
  @ApiOperation({ summary: 'Get mangas from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Collection mangas retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  getCollectionMangas(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getCollectionMangas(userId, type, parseInt(page), parseInt(limit), currentUserId);
  }

  @Post('user/:userId/type/:type/mangas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add manga to user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiResponse({ status: 201, description: 'Manga added to collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Manga not found' })
  @ApiResponse({ status: 409, description: 'Manga already in collection' })
  addMangaToCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Body() addMangaDto: AddMangaToCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.addMangaToCollection(userId, type, addMangaDto, req.user.id);
  }

  @Delete('user/:userId/type/:type/mangas/:mangaId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove manga from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiParam({ name: 'mangaId', type: 'number', description: 'Manga ID' })
  @ApiResponse({ status: 200, description: 'Manga removed from collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Manga not found in collection' })
  removeMangaFromCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Param('mangaId', ParseIntPipe) mangaId: number,
    @Request() req,
  ) {
    return this.collectionsService.removeMangaFromCollection(userId, type, mangaId, req.user.id);
  }
}