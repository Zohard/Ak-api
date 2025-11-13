import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { IgdbService } from '../../../shared/services/igdb.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import { ImageKitService } from '../../media/imagekit.service';
import { AdminJeuxVideoListQueryDto, CreateAdminJeuxVideoDto, UpdateAdminJeuxVideoDto } from './dto/admin-jeux-video.dto';
import { CreateJeuVideoTrailerDto } from './dto/create-jeu-video-trailer.dto';
import { UpdateJeuVideoTrailerDto } from './dto/update-jeu-video-trailer.dto';

@Injectable()
export class AdminJeuxVideoService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
    private igdbService: IgdbService,
    private imagekitService: ImageKitService,
  ) {}

  async list(query: AdminJeuxVideoListQueryDto) {
    const { page = 1, statut, search, plateforme } = query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (statut !== undefined) where.statut = statut;
    if (plateforme) where.plateforme = { contains: plateforme, mode: 'insensitive' };
    if (search) where.titre = { contains: search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.akJeuxVideo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dateAjout: 'desc' },
        select: {
          idJeu: true,
          titre: true,
          niceUrl: true,
          plateforme: true,
          genre: true,
          editeur: true,
          annee: true,
          dateSortieJapon: true,
          dateSortieUsa: true,
          dateSortieEurope: true,
          dateSortieWorldwide: true,
          statut: true,
          image: true,
        }
      }),
      this.prisma.akJeuxVideo.count({ where }),
    ]);

    // Map idJeu to idJeuVideo for frontend consistency
    const mappedItems = items.map(item => ({
      ...item,
      idJeuVideo: item.idJeu,
    }));

    return {
      items: mappedItems,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async getOne(id: number) {
    const item = await this.prisma.akJeuxVideo.findUnique({
      where: { idJeu: id },
      select: {
        idJeu: true,
        titre: true,
        niceUrl: true,
        plateforme: true,
        genre: true,
        editeur: true,
        annee: true,
        dateSortieJapon: true,
        dateSortieUsa: true,
        dateSortieEurope: true,
        dateSortieWorldwide: true,
        presentation: true,
        image: true,
        statut: true,
        platforms: {
          select: {
            idRelation: true,
            idPlatform: true,
            releaseDate: true,
            isPrimary: true,
            platform: {
              select: {
                idPlatform: true,
                name: true,
                manufacturer: true,
                platformType: true,
              }
            }
          },
          orderBy: { isPrimary: 'desc' }
        },
        genres: {
          select: {
            idRelation: true,
            idGenre: true,
            genre: {
              select: {
                idGenre: true,
                name: true,
                slug: true,
              }
            }
          }
        },
        trailers: {
          select: {
            idTrailer: true,
            titre: true,
            url: true,
            platform: true,
            langue: true,
            typeTrailer: true,
            ordre: true,
            dateAjout: true,
            statut: true,
          },
          orderBy: { ordre: 'asc' }
        }
      }
    });

    if (!item) throw new NotFoundException('Jeu vidéo introuvable');

    // Map idJeu to idJeuVideo and presentation to description for frontend consistency
    return {
      ...item,
      idJeuVideo: item.idJeu,
      description: item.presentation,
      platformIds: item.platforms.map(p => p.idPlatform),
      genreIds: item.genres.map(g => g.idGenre),
    };
  }

  async create(dto: CreateAdminJeuxVideoDto, username?: string) {
    const data: any = { ...dto };
    const platformIds = data.platformIds || [];
    const genreIds = data.genreIds || [];
    delete data.platformIds; // Remove from main data object
    delete data.genreIds; // Remove from main data object

    // Map description to presentation for database
    if (data.description !== undefined) {
      data.presentation = data.description;
      delete data.description;
    }

    // Convert date strings to Date objects
    if (data.dateSortieJapon) data.dateSortieJapon = new Date(data.dateSortieJapon);
    if (data.dateSortieUsa) data.dateSortieUsa = new Date(data.dateSortieUsa);
    if (data.dateSortieEurope) data.dateSortieEurope = new Date(data.dateSortieEurope);
    if (data.dateSortieWorldwide) data.dateSortieWorldwide = new Date(data.dateSortieWorldwide);

    if (!data.niceUrl && data.titre) {
      data.niceUrl = this.slugify(data.titre);
    }

    const created = await this.prisma.akJeuxVideo.create({ data });

    // Create platform associations if platformIds provided
    if (platformIds.length > 0) {
      await this.prisma.akJeuxVideoPlatform.createMany({
        data: platformIds.map((idPlatform: number, index: number) => ({
          idJeu: created.idJeu,
          idPlatform,
          isPrimary: index === 0, // First platform is primary
        })),
      });
    }

    // Create genre associations if genreIds provided
    if (genreIds.length > 0) {
      await this.prisma.akJeuxVideoGenre.createMany({
        data: genreIds.map((idGenre: number) => ({
          idJeu: created.idJeu,
          idGenre,
        })),
      });
    }

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idJeu, 'jeu_video', username, 'Création fiche');
    }

    return {
      ...created,
      idJeuVideo: created.idJeu,
      description: created.presentation,
      platformIds,
      genreIds,
    };
  }

  async update(id: number, dto: UpdateAdminJeuxVideoDto, username?: string) {
    const existing = await this.prisma.akJeuxVideo.findUnique({ where: { idJeu: id } });
    if (!existing) throw new NotFoundException('Jeu vidéo introuvable');

    const data: any = { ...dto };
    const platformIds = data.platformIds;
    const genreIds = data.genreIds;
    delete data.platformIds; // Remove from main data object
    delete data.genreIds; // Remove from main data object

    // Map description to presentation for database
    if (data.description !== undefined) {
      data.presentation = data.description;
      delete data.description;
    }

    // Convert date strings to Date objects
    if (data.dateSortieJapon) data.dateSortieJapon = new Date(data.dateSortieJapon);
    if (data.dateSortieUsa) data.dateSortieUsa = new Date(data.dateSortieUsa);
    if (data.dateSortieEurope) data.dateSortieEurope = new Date(data.dateSortieEurope);
    if (data.dateSortieWorldwide) data.dateSortieWorldwide = new Date(data.dateSortieWorldwide);

    if (dto.titre && !dto.niceUrl) {
      data.niceUrl = this.slugify(dto.titre);
    }

    const updated = await this.prisma.akJeuxVideo.update({
      where: { idJeu: id },
      data
    });

    // Update platform associations if platformIds provided
    if (platformIds !== undefined) {
      // Delete existing associations
      await this.prisma.akJeuxVideoPlatform.deleteMany({
        where: { idJeu: id }
      });

      // Create new associations
      if (platformIds.length > 0) {
        await this.prisma.akJeuxVideoPlatform.createMany({
          data: platformIds.map((idPlatform: number, index: number) => ({
            idJeu: id,
            idPlatform,
            isPrimary: index === 0, // First platform is primary
          })),
        });
      }
    }

    // Update genre associations if genreIds provided
    if (genreIds !== undefined) {
      // Delete existing associations
      await this.prisma.akJeuxVideoGenre.deleteMany({
        where: { idJeu: id }
      });

      // Create new associations
      if (genreIds.length > 0) {
        await this.prisma.akJeuxVideoGenre.createMany({
          data: genreIds.map((idGenre: number) => ({
            idJeu: id,
            idGenre,
          })),
        });
      }
    }

    // Log the update
    if (username) {
      await this.adminLogging.addLog(id, 'jeu_video', username, 'Modification infos principales');
    }

    return {
      ...updated,
      idJeuVideo: updated.idJeu,
      description: updated.presentation,
      platformIds,
      genreIds,
    };
  }

  async updateStatus(id: number, statut: number, username?: string) {
    const existing = await this.prisma.akJeuxVideo.findUnique({ where: { idJeu: id } });
    if (!existing) throw new NotFoundException('Jeu vidéo introuvable');

    const updated = await this.prisma.akJeuxVideo.update({
      where: { idJeu: id },
      data: { statut }
    });

    // Log the status change
    if (username) {
      await this.adminLogging.addLog(id, 'jeu_video', username, `Modification statut (${statut})`);
    }

    return {
      ...updated,
      idJeuVideo: updated.idJeu,
    };
  }

  async remove(id: number) {
    const existing = await this.prisma.akJeuxVideo.findUnique({ where: { idJeu: id } });
    if (!existing) throw new NotFoundException('Jeu vidéo introuvable');

    await this.prisma.akJeuxVideo.delete({ where: { idJeu: id } });
    return { message: 'Jeu vidéo supprimé' };
  }

  /**
   * Search IGDB for games
   */
  async searchIgdb(query: string) {
    const games = await this.igdbService.searchGames(query, 20);

    return games.map(game => ({
      igdbId: game.id,
      name: game.name,
      summary: game.summary,
      releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000) : null,
      cover: game.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : null,
      platforms: game.platforms?.map(p => p.name).join(', ') || null,
      genres: game.genres?.map(g => g.name).join(', ') || null,
    }));
  }

  /**
   * Import a game from IGDB
   */
  async importFromIgdb(igdbId: number, username?: string) {
    // Fetch full game data from IGDB
    const igdbGame = await this.igdbService.getGameById(igdbId);

    if (!igdbGame) {
      throw new NotFoundException('Game not found on IGDB');
    }

    // Extract release year
    const releaseYear = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000).getFullYear()
      : undefined;

    // Get or create publisher
    const publisher = igdbGame.involved_companies?.find(c => c.publisher)?.company?.name;

    // Map genres from IGDB to our database
    const genreIds = await this.mapIgdbGenres(igdbGame.genres || []);

    // Map platforms from IGDB to our database
    const platformIds = await this.mapIgdbPlatforms(igdbGame.platforms || []);

    // Map regional release dates
    const releaseDates = this.mapIgdbReleaseDates(igdbGame.release_dates || []);

    // Create the game
    const gameData: any = {
      titre: igdbGame.name,
      niceUrl: this.slugify(igdbGame.name),
      presentation: igdbGame.summary || null,
      annee: releaseYear || 0,
      editeur: publisher || null,
      dateSortieJapon: releaseDates.japon || null,
      dateSortieUsa: releaseDates.usa || null,
      dateSortieEurope: releaseDates.europe || null,
      dateSortieWorldwide: releaseDates.worldwide || null,
      statut: 2, // En attente by default
      // Initialize all required integer fields
      disponibilite: 0,
      label: 0,
      nbReviews: 0,
      moyenneNotes: 0,
      nbClics: 0,
      nbClicsDay: 0,
      nbClicsWeek: 0,
      nbClicsMonth: 0,
      lienForum: 0, // Note: camelCase for Prisma
      dateModification: Math.floor(Date.now() / 1000), // Unix timestamp
    };

    // Download and save cover image if available
    if (igdbGame.cover?.image_id) {
      try {
        const imageBuffer = await this.igdbService.downloadCoverImage(igdbGame.cover.image_id);
        if (imageBuffer) {
          // Upload to ImageKit
          const filename = `igdb-${igdbId}-${Date.now()}.jpg`;
          const uploadResult = await this.imagekitService.uploadImage(
            imageBuffer,
            filename,
            'images/games', // Upload to images/games folder
            true // Replace existing if same name
          );

          if (uploadResult && uploadResult.name) {
            // Store just the filename (not the full URL)
            gameData.image = uploadResult.name;
            console.log(`Successfully uploaded cover image for IGDB ID ${igdbId}: ${uploadResult.name}`);
          }
        }
      } catch (error) {
        console.error(`Failed to upload cover image for IGDB ID ${igdbId}:`, error);
        // Continue without image if upload fails
      }
    }

    const created = await this.prisma.akJeuxVideo.create({ data: gameData });

    // Create platform associations
    if (platformIds.length > 0) {
      await this.prisma.akJeuxVideoPlatform.createMany({
        data: platformIds.map((idPlatform: number, index: number) => ({
          idJeu: created.idJeu,
          idPlatform,
          isPrimary: index === 0,
        })),
        skipDuplicates: true,
      });
    }

    // Create genre associations
    if (genreIds.length > 0) {
      await this.prisma.akJeuxVideoGenre.createMany({
        data: genreIds.map((idGenre: number) => ({
          idJeu: created.idJeu,
          idGenre,
        })),
        skipDuplicates: true,
      });
    }

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idJeu, 'jeu_video', username, `Import IGDB (ID: ${igdbId})`);
    }

    return {
      ...created,
      idJeuVideo: created.idJeu,
      description: created.presentation,
      platformIds,
      genreIds,
    };
  }

  /**
   * Map IGDB genres to database genre IDs
   */
  private async mapIgdbGenres(igdbGenres: Array<{ id: number; name: string }>): Promise<number[]> {
    const genreMap: Record<string, string> = {
      'Role-playing (RPG)': 'RPG',
      'Shooter': 'Action',
      'Platform': 'Platformer',
      'Fighting': 'Combat',
      'Strategy': 'Strategy',
      'Adventure': 'Adventure',
      'Puzzle': 'Puzzle',
      'Racing': 'Racing',
      'Sport': 'Sports',
      'Simulator': 'Simulation',
    };

    const genreIds: number[] = [];

    for (const igdbGenre of igdbGenres) {
      const mappedName = genreMap[igdbGenre.name] || igdbGenre.name;
      const slug = this.slugify(mappedName);

      // Try to find existing genre by name or slug
      let genre = await this.prisma.akGenre.findFirst({
        where: {
          OR: [
            { name: { equals: mappedName, mode: 'insensitive' } },
            { slug: slug }
          ]
        }
      });

      // Create if doesn't exist
      if (!genre) {
        try {
          genre = await this.prisma.akGenre.create({
            data: {
              name: mappedName,
              slug: slug,
            }
          });
        } catch (error) {
          // If creation failed due to unique constraint (race condition), try to find again
          if (error.code === 'P2002') {
            genre = await this.prisma.akGenre.findFirst({
              where: {
                OR: [
                  { name: { equals: mappedName, mode: 'insensitive' } },
                  { slug: slug }
                ]
              }
            });
          }

          // If still not found, re-throw the error
          if (!genre) {
            throw error;
          }
        }
      }

      genreIds.push(genre.idGenre);
    }

    return genreIds;
  }

  /**
   * Map IGDB platforms to database platform IDs
   */
  private async mapIgdbPlatforms(igdbPlatforms: Array<{ id: number; name: string; abbreviation?: string }>): Promise<number[]> {
    const platformMap: Record<string, string> = {
      'PC (Microsoft Windows)': 'PC',
      'PlayStation 5': 'PlayStation 5',
      'PlayStation 4': 'PlayStation 4',
      'Xbox Series X|S': 'Xbox Series X|S',
      'Nintendo Switch': 'Nintendo Switch',
      'PlayStation 3': 'PlayStation 3',
      'Xbox 360': 'Xbox 360',
      'Wii U': 'Wii U',
    };

    const platformIds: number[] = [];

    for (const igdbPlatform of igdbPlatforms) {
      const mappedName = platformMap[igdbPlatform.name] || igdbPlatform.abbreviation || igdbPlatform.name;

      // Try to find existing platform
      let platform = await this.prisma.akPlatform.findFirst({
        where: { name: { equals: mappedName, mode: 'insensitive' } }
      });

      // Create if doesn't exist
      if (!platform) {
        try {
          platform = await this.prisma.akPlatform.create({
            data: {
              name: mappedName,
            }
          });
        } catch (error) {
          // If creation failed due to unique constraint (race condition), try to find again
          if (error.code === 'P2002') {
            platform = await this.prisma.akPlatform.findFirst({
              where: { name: { equals: mappedName, mode: 'insensitive' } }
            });
          }

          // If still not found, re-throw the error
          if (!platform) {
            throw error;
          }
        }
      }

      platformIds.push(platform.idPlatform);
    }

    return platformIds;
  }

  /**
   * Map IGDB release dates to regional dates
   */
  private mapIgdbReleaseDates(releaseDates: Array<{ date?: number; region?: number }>): {
    japon: Date | null;
    usa: Date | null;
    europe: Date | null;
    worldwide: Date | null;
  } {
    const result = {
      japon: null as Date | null,
      usa: null as Date | null,
      europe: null as Date | null,
      worldwide: null as Date | null,
    };

    for (const release of releaseDates) {
      if (!release.date) continue;

      const date = new Date(release.date * 1000);
      const region = this.igdbService.mapRegion(release.region);

      if (region && !result[region]) {
        result[region] = date;
      }
    }

    return result;
  }

  /**
   * Add a trailer to a video game
   */
  async addTrailer(dto: CreateJeuVideoTrailerDto, username?: string) {
    // Verify game exists
    const game = await this.prisma.akJeuxVideo.findUnique({ where: { idJeu: dto.idJeu } });
    if (!game) throw new NotFoundException('Jeu vidéo introuvable');

    const trailer = await this.prisma.akJeuxVideoTrailer.create({
      data: {
        idJeu: dto.idJeu,
        titre: dto.titre || null,
        url: dto.url,
        platform: dto.platform || null,
        langue: dto.langue || 'en',
        typeTrailer: dto.typeTrailer || 'Trailer',
        ordre: dto.ordre || 0,
        statut: dto.statut !== undefined ? dto.statut : 1,
      }
    });

    // Log the action
    if (username) {
      await this.adminLogging.addLog(dto.idJeu, 'jeu_video', username, 'Ajout bande-annonce');
    }

    return trailer;
  }

  /**
   * Update a trailer
   */
  async updateTrailer(trailerId: number, dto: UpdateJeuVideoTrailerDto, username?: string) {
    const existing = await this.prisma.akJeuxVideoTrailer.findUnique({ where: { idTrailer: trailerId } });
    if (!existing) throw new NotFoundException('Bande-annonce introuvable');

    const updated = await this.prisma.akJeuxVideoTrailer.update({
      where: { idTrailer: trailerId },
      data: dto
    });

    // Log the action
    if (username) {
      await this.adminLogging.addLog(existing.idJeu, 'jeu_video', username, 'Modification bande-annonce');
    }

    return updated;
  }

  /**
   * Delete a trailer
   */
  async removeTrailer(trailerId: number, username?: string) {
    const existing = await this.prisma.akJeuxVideoTrailer.findUnique({ where: { idTrailer: trailerId } });
    if (!existing) throw new NotFoundException('Bande-annonce introuvable');

    await this.prisma.akJeuxVideoTrailer.delete({ where: { idTrailer: trailerId } });

    // Log the action
    if (username) {
      await this.adminLogging.addLog(existing.idJeu, 'jeu_video', username, 'Suppression bande-annonce');
    }

    return { message: 'Bande-annonce supprimée' };
  }

  private slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}
