import { Controller, Get, Query, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../shared/services/prisma.service';

// Backward-compatible endpoints for older frontend calls:
// - GET /api/collection-animes?id_membre=:id
// - GET /api/collection-mangas?id_membre=:id
// These return a light payload of the user's collection items to unblock pages
// still calling the legacy paths (e.g., recommendations page).

@ApiTags('legacy')
@Controller()
export class LegacyCollectionsController {
  constructor(private prisma: PrismaService) { }

  @Get('collection-animes')
  @ApiOperation({ summary: 'Legacy: Get all anime items in a user collection (all types)' })
  @ApiQuery({ name: 'id_membre', required: true, type: Number, description: 'User ID (legacy param name)' })
  @ApiResponse({ status: 200, description: 'Anime collection items returned (legacy format)' })
  async getLegacyCollectionAnimes(
    @Query('id_membre', ParseIntPipe) idMembre: number,
  ) {
    if (!idMembre) throw new BadRequestException('id_membre is required');

    const items = await this.prisma.collectionAnime.findMany({
      where: { idMembre },
      orderBy: { createdAt: 'desc' },
      include: {
        anime: {
          select: {
            idAnime: true,
            titre: true,
            image: true,
            annee: true,
            moyenneNotes: true,
            nbEp: true,
            niceUrl: true,
          },
        },
      },
    });

    return {
      success: true,
      total: items.length,
      data: items.map((i) => ({
        id_collection: i.idCollection,
        id_anime: i.idAnime,
        type: i.type,
        evaluation: i.evaluation,
        notes: i.notes,
        addedAt: i.createdAt ?? null,
        anime: i.anime,
      })),
      items: items.map((i) => ({
        id_collection: i.idCollection,
        id_anime: i.idAnime,
        type: i.type,
        evaluation: i.evaluation,
        notes: i.notes,
        addedAt: i.createdAt ?? null,
        anime: i.anime,
      })),
    };
  }

  @Get('collection-mangas')
  @ApiOperation({ summary: 'Legacy: Get all manga items in a user collection (all types)' })
  @ApiQuery({ name: 'id_membre', required: true, type: Number, description: 'User ID (legacy param name)' })
  @ApiResponse({ status: 200, description: 'Manga collection items returned (legacy format)' })
  async getLegacyCollectionMangas(
    @Query('id_membre', ParseIntPipe) idMembre: number,
  ) {
    if (!idMembre) throw new BadRequestException('id_membre is required');

    const items = await this.prisma.collectionManga.findMany({
      where: { idMembre },
      orderBy: { createdAt: 'desc' },
      include: {
        manga: {
          select: {
            idManga: true,
            titre: true,
            image: true,
            annee: true,
            moyenneNotes: true,
            nbVol: true,
            niceUrl: true,
          },
        },
      },
    });

    return {
      success: true,
      total: items.length,
      data: items.map((i) => ({
        id_collection: i.idCollection,
        id_manga: i.idManga,
        type: i.type,
        evaluation: i.evaluation,
        notes: i.notes,
        addedAt: i.createdAt ?? null,
        manga: i.manga,
      })),
      items: items.map((i) => ({
        id_collection: i.idCollection,
        id_manga: i.idManga,
        type: i.type,
        evaluation: i.evaluation,
        notes: i.notes,
        addedAt: i.createdAt ?? null,
        manga: i.manga,
      })),
    };
  }

  @Get('collection-games')
  @ApiOperation({ summary: 'Legacy: Get all game items in a user collection (all types)' })
  @ApiQuery({ name: 'id_membre', required: true, type: Number, description: 'User ID (legacy param name)' })
  @ApiResponse({ status: 200, description: 'Game collection items returned (legacy format)' })
  async getLegacyCollectionGames(
    @Query('id_membre', ParseIntPipe) idMembre: number,
  ) {
    if (!idMembre) throw new BadRequestException('id_membre is required');

    const items = await this.prisma.collectionJeuxVideo.findMany({
      where: { idMembre },
      orderBy: { dateCreated: 'desc' },
      include: {
        jeuxVideo: {
          select: {
            idJeu: true,
            titre: true,
            image: true,
            annee: true,
            moyenneNotes: true,
            plateforme: true,
          },
        },
      },
    });

    const mappedData = items.map((i) => ({
      id_collection: i.idCollection,
      id_jeu: i.idJeu,
      type: i.type,
      evaluation: i.evaluation,
      notes: i.notes,
      addedAt: i.dateCreated ?? null,
      game: {
        ...i.jeuxVideo,
        id: i.jeuxVideo.idJeu, // map idJeu to id for consistent frontend usage
      },
    }));

    return {
      success: true,
      total: items.length,
      data: mappedData,
      items: mappedData,
    };
  }
}

