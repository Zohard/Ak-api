import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { IgdbService } from '../../../shared/services/igdb.service';
import { DeepLService } from '../../../shared/services/deepl.service';
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
    private deepLService: DeepLService,
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

  async searchByName(query: string, limit = 10) {
    const q = `%${query}%`;
    const rows = await this.prisma.$queryRaw`
      SELECT
        id_jeu as id,
        id_jeu as "idJeuVideo",
        titre,
        statut
      FROM ak_jeux_video
      WHERE titre ILIKE ${q}
      ORDER BY titre
      LIMIT ${limit}
    `;
    return { items: rows };
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
    console.log('IGDB release_dates raw data:', JSON.stringify(igdbGame.release_dates, null, 2));
    const releaseDates = this.mapIgdbReleaseDates(igdbGame.release_dates || []);
    console.log('Mapped release dates:', releaseDates);

    // Fallback: If no regional dates found but first_release_date is available,
    // use it as the worldwide release date
    if (!releaseDates.japon && !releaseDates.usa && !releaseDates.europe && !releaseDates.worldwide && igdbGame.first_release_date) {
      releaseDates.worldwide = new Date(igdbGame.first_release_date * 1000);
      console.log('No regional dates found. Using first_release_date as worldwide:', releaseDates.worldwide);
    }

    // Translate summary to French if available
    let translatedSummary: string | null = null;
    if (igdbGame.summary) {
      translatedSummary = await this.deepLService.translateToFrench(igdbGame.summary);
      // If translation fails, fall back to original summary
      if (!translatedSummary) {
        translatedSummary = igdbGame.summary;
      }
    }

    // Create the game
    const gameData: any = {
      titre: igdbGame.name,
      niceUrl: this.slugify(igdbGame.name),
      presentation: translatedSummary,
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
      igdbId: igdbId, // Store IGDB ID for future updates
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

    // Download and save screenshots if available
    if (igdbGame.screenshots && igdbGame.screenshots.length > 0) {
      await this.importScreenshots(created.idJeu, igdbId, igdbGame.screenshots);
    }

    // Import trailers if available
    if (igdbGame.videos && igdbGame.videos.length > 0) {
      await this.importTrailers(created.idJeu, igdbGame.videos, created.titre || 'Game');
    }

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
   * Fetch game data from IGDB for form update (without creating database entry)
   * Downloads and uploads cover image if not already present
   */
  async fetchFromIgdb(igdbId: number, currentImage?: string | null) {
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

    // Fallback: If no regional dates found but first_release_date is available,
    // use it as the worldwide release date
    if (!releaseDates.japon && !releaseDates.usa && !releaseDates.europe && !releaseDates.worldwide && igdbGame.first_release_date) {
      releaseDates.worldwide = new Date(igdbGame.first_release_date * 1000);
      console.log('No regional dates found. Using first_release_date as worldwide:', releaseDates.worldwide);
    }

    // Helper function to format Date to YYYY-MM-DD for HTML date inputs
    const formatDate = (date: Date | null): string | null => {
      if (!date) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Translate summary to French if available
    let translatedSummary: string | null = null;
    if (igdbGame.summary) {
      translatedSummary = await this.deepLService.translateToFrench(igdbGame.summary);
      // If translation fails, fall back to original summary
      if (!translatedSummary) {
        translatedSummary = igdbGame.summary;
      }
    }

    // Download and upload cover image if current image is null or empty
    let imageName: string | null = currentImage || null;

    if ((!currentImage || currentImage.trim() === '') && igdbGame.cover?.image_id) {
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
            imageName = uploadResult.name;
            console.log(`Successfully uploaded cover image for IGDB ID ${igdbId}: ${uploadResult.name}`);
          }
        }
      } catch (error) {
        console.error(`Failed to upload cover image for IGDB ID ${igdbId}:`, error);
        // Continue without image if upload fails
      }
    }

    // Return formatted data for form update
    return {
      titre: igdbGame.name,
      description: translatedSummary,
      annee: releaseYear || 0,
      editeur: publisher || null,
      dateSortieJapon: formatDate(releaseDates.japon),
      dateSortieUsa: formatDate(releaseDates.usa),
      dateSortieEurope: formatDate(releaseDates.europe),
      dateSortieWorldwide: formatDate(releaseDates.worldwide),
      platformIds,
      genreIds,
      igdbId: igdbId, // Include IGDB ID for storage
      image: imageName, // Include image if downloaded/uploaded or existing
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
    // Map IGDB platform names to your database names
    // Format: 'IGDB Name': 'Your DB Name'
    const platformMap: Record<string, string> = {
      // PC
      'PC (Microsoft Windows)': 'PC',
      'Mac': 'Mac',
      'Linux': 'Linux',
      // PlayStation
      'PlayStation 5': 'PlayStation 5',
      'PlayStation 4': 'PlayStation 4',
      'PlayStation 3': 'PlayStation 3',
      'PlayStation 2': 'PlayStation 2',
      'PlayStation': 'PlayStation',
      'PlayStation Vita': 'PlayStation Vita',
      'PlayStation Portable': 'PSP',
      // Xbox
      'Xbox Series X|S': 'Xbox Series X|S',
      'Xbox One': 'Xbox One',
      'Xbox 360': 'Xbox 360',
      'Xbox': 'Xbox',
      // Nintendo - Home Consoles
      'Nintendo Switch': 'Nintendo Switch',
      'Wii U': 'Wii U',
      'Wii': 'Wii',
      'Nintendo GameCube': 'GameCube',
      'Nintendo 64': 'Nintendo 64',
      'Super Nintendo Entertainment System (SNES)': 'Super Nintendo',
      'Nintendo Entertainment System (NES)': 'NES',
      // Nintendo - Handhelds
      'Nintendo 3DS': 'Nintendo 3DS',
      'Nintendo DS': 'Nintendo DS',
      'Nintendo DSi': 'Nintendo DS',
      'Game Boy Advance': 'Game Boy Advance',
      'Game Boy Color': 'Game Boy Color',
      'Game Boy': 'Game Boy',
      // Sega
      'Sega Dreamcast': 'Dreamcast',
      'Sega Saturn': 'Saturn',
      'Sega Mega Drive/Genesis': 'Mega Drive',
      'Sega Game Gear': 'Game Gear',
      // Mobile
      'iOS': 'iOS',
      'Android': 'Android',
      // Other
      'Arcade': 'Arcade',
    };

    // Also map common abbreviations to your DB names
    const abbreviationMap: Record<string, string> = {
      'PS5': 'PlayStation 5',
      'PS4': 'PlayStation 4',
      'PS3': 'PlayStation 3',
      'PS2': 'PlayStation 2',
      'PS1': 'PlayStation',
      'PSP': 'PSP',
      'PSV': 'PlayStation Vita',
      'PSVITA': 'PlayStation Vita',
      'XSX': 'Xbox Series X|S',
      'XONE': 'Xbox One',
      'X360': 'Xbox 360',
      'NSW': 'Nintendo Switch',
      'WIIU': 'Wii U',
      'GCN': 'GameCube',
      'NGC': 'GameCube',
      'N64': 'Nintendo 64',
      'SNES': 'Super Nintendo',
      'NES': 'NES',
      '3DS': 'Nintendo 3DS',
      'NDS': 'Nintendo DS',
      'DS': 'Nintendo DS',
      'GBA': 'Game Boy Advance',
      'GBC': 'Game Boy Color',
      'GB': 'Game Boy',
      'DC': 'Dreamcast',
      'SAT': 'Saturn',
      'GEN': 'Mega Drive',
      'MD': 'Mega Drive',
      'GG': 'Game Gear',
    };

    const platformIds: number[] = [];

    for (const igdbPlatform of igdbPlatforms) {
      // First try the direct name mapping
      let targetName = platformMap[igdbPlatform.name];

      // If not found, try the abbreviation mapping
      if (!targetName && igdbPlatform.abbreviation) {
        targetName = abbreviationMap[igdbPlatform.abbreviation.toUpperCase()];
      }

      // Fallback to abbreviation or original name
      if (!targetName) {
        targetName = igdbPlatform.abbreviation || igdbPlatform.name;
      }

      // Try to find existing platform by name
      let platform = await this.prisma.akPlatform.findFirst({
        where: { name: { equals: targetName, mode: 'insensitive' } }
      });

      // Also try to find by shortName if not found
      if (!platform) {
        platform = await this.prisma.akPlatform.findFirst({
          where: { shortName: { equals: targetName, mode: 'insensitive' } }
        });
      }

      // Also try to find by the original IGDB name (in case it already exists)
      if (!platform) {
        platform = await this.prisma.akPlatform.findFirst({
          where: { name: { equals: igdbPlatform.name, mode: 'insensitive' } }
        });
      }

      // Create if doesn't exist
      if (!platform) {
        try {
          platform = await this.prisma.akPlatform.create({
            data: {
              name: targetName,
              shortName: igdbPlatform.abbreviation || null,
            }
          });
        } catch (error) {
          // If creation failed due to unique constraint (race condition), try to find again
          if (error.code === 'P2002') {
            platform = await this.prisma.akPlatform.findFirst({
              where: { name: { equals: targetName, mode: 'insensitive' } }
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

    console.log(`Processing ${releaseDates.length} release dates`);

    for (const release of releaseDates) {
      console.log('Processing release:', { date: release.date, region: release.region });

      if (!release.date) {
        console.log('Skipping release - no date');
        continue;
      }

      const date = new Date(release.date * 1000);
      const region = this.igdbService.mapRegion(release.region);

      console.log(`Converted: region code ${release.region} -> ${region}, date: ${date.toISOString()}`);

      if (region && !result[region]) {
        result[region] = date;
        console.log(`Set ${region} to ${date.toISOString()}`);
      }
    }

    console.log('Final result:', result);
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

  /**
   * Fetch and save screenshots from IGDB for an existing game
   */
  async fetchAndSaveScreenshots(idJeu: number, igdbId: number, username?: string) {
    // Verify game exists
    const game = await this.prisma.akJeuxVideo.findUnique({ where: { idJeu } });
    if (!game) throw new NotFoundException('Jeu vidéo introuvable');

    // Fetch game data from IGDB to get screenshots
    const igdbGame = await this.igdbService.getGameById(igdbId);
    if (!igdbGame) {
      throw new NotFoundException('Game not found on IGDB');
    }

    if (!igdbGame.screenshots || igdbGame.screenshots.length === 0) {
      return { message: 'No screenshots found on IGDB for this game', count: 0 };
    }

    // Import screenshots
    const importedCount = await this.importScreenshots(idJeu, igdbId, igdbGame.screenshots);

    // Log the action
    if (username) {
      await this.adminLogging.addLog(idJeu, 'jeu_video', username, `Import ${importedCount} screenshot(s) depuis IGDB`);
    }

    return {
      message: `Successfully imported ${importedCount} screenshot(s)`,
      count: importedCount
    };
  }

  /**
   * Import screenshots from IGDB for a game
   * @private
   */
  private async importScreenshots(
    idJeu: number,
    igdbId: number,
    screenshots: Array<{ id: number; image_id: string }>
  ): Promise<number> {
    let sortorder = 0;

    // Get current max sortorder
    const maxSortOrder = await this.prisma.akJeuxVideoScreenshot.findFirst({
      where: { jeuVideoId: idJeu },
      orderBy: { sortorder: 'desc' },
      select: { sortorder: true }
    });

    if (maxSortOrder && maxSortOrder.sortorder !== null) {
      sortorder = maxSortOrder.sortorder + 1;
    }

    let importedCount = 0;

    for (const screenshot of screenshots.slice(0, 10)) { // Limit to first 10 screenshots
      try {
        const imageBuffer = await this.igdbService.downloadCoverImage(
          screenshot.image_id,
          'screenshot_med' // Medium size for balance between quality and file size
        );

        if (imageBuffer) {
          // Upload to ImageKit
          const filename = `igdb-${igdbId}-screenshot-${screenshot.id}-${Date.now()}.jpg`;
          const uploadResult = await this.imagekitService.uploadImage(
            imageBuffer,
            filename,
            'images/games/screenshots', // Screenshots folder
            true // Replace if exists
          );

          if (uploadResult && uploadResult.name) {
            // Save to database
            await this.prisma.akJeuxVideoScreenshot.create({
              data: {
                jeuVideoId: idJeu,
                filename: uploadResult.name,
                sortorder: sortorder++,
                createdat: new Date(),
              }
            });
            importedCount++;
            console.log(`Successfully imported screenshot ${screenshot.id} for game ${idJeu}`);
          }
        }
      } catch (error) {
        console.error(`Failed to import screenshot ${screenshot.id} for IGDB ID ${igdbId}:`, error);
        // Continue with other screenshots even if one fails
      }
    }

    if (importedCount > 0) {
      console.log(`Successfully imported ${importedCount} screenshot(s) for IGDB ID ${igdbId}`);
    }

    return importedCount;
  }

  /**
   * Fetch and save trailers from IGDB for an existing game
   */
  async fetchAndSaveTrailers(idJeu: number, igdbId: number, username?: string) {
    // Verify game exists
    const game = await this.prisma.akJeuxVideo.findUnique({
      where: { idJeu }
    });

    if (!game) {
      throw new NotFoundException('Jeu vidéo introuvable');
    }

    // Fetch game data from IGDB
    const igdbGame = await this.igdbService.getGameById(igdbId);
    if (!igdbGame) {
      throw new NotFoundException('Game not found on IGDB');
    }

    if (!igdbGame.videos || igdbGame.videos.length === 0) {
      return {
        message: 'No trailers found on IGDB for this game',
        count: 0
      };
    }

    const importedCount = await this.importTrailers(idJeu, igdbGame.videos, game.titre || 'Game');

    // Log the action
    if (username) {
      await this.adminLogging.addLog(
        idJeu,
        'jeu_video',
        username,
        `Import ${importedCount} trailer(s) depuis IGDB`
      );
    }

    return {
      message: `Successfully imported ${importedCount} trailer(s)`,
      count: importedCount
    };
  }

  /**
   * Import trailers from IGDB video data
   * IGDB provides YouTube video IDs - we convert them to full URLs
   */
  private async importTrailers(
    idJeu: number,
    videos: Array<{ id: number; video_id: string; name?: string }>,
    gameTitle: string
  ): Promise<number> {
    let importedCount = 0;

    // Get current max ordre
    const maxOrdre = await this.prisma.akJeuxVideoTrailer.findFirst({
      where: { idJeu },
      orderBy: { ordre: 'desc' },
      select: { ordre: true }
    });

    let ordre = maxOrdre?.ordre ? maxOrdre.ordre + 1 : 0;

    // Limit to 10 trailers
    for (const video of videos.slice(0, 10)) {
      try {
        // IGDB video_id is a YouTube video ID
        const youtubeUrl = `https://www.youtube.com/watch?v=${video.video_id}`;

        // Check if this trailer already exists (by URL)
        const existingTrailer = await this.prisma.akJeuxVideoTrailer.findFirst({
          where: {
            idJeu,
            url: youtubeUrl
          }
        });

        if (existingTrailer) {
          console.log(`Trailer ${video.video_id} already exists for game ${idJeu}, skipping`);
          continue;
        }

        // Create trailer title - use IGDB name or default
        const titre = video.name || `${gameTitle} - Trailer`;

        await this.prisma.akJeuxVideoTrailer.create({
          data: {
            idJeu,
            titre,
            url: youtubeUrl,
            platform: 'youtube',
            langue: 'en', // Default to English
            typeTrailer: 'Trailer',
            ordre: ordre++,
            statut: 1
          }
        });

        importedCount++;
        console.log(`Successfully imported trailer ${video.video_id} for game ${idJeu}`);
      } catch (error) {
        console.error(`Failed to import trailer ${video.video_id}:`, error);
        continue;
      }
    }

    return importedCount;
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
