import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import { AdminJeuxVideoListQueryDto, CreateAdminJeuxVideoDto, UpdateAdminJeuxVideoDto } from './dto/admin-jeux-video.dto';

@Injectable()
export class AdminJeuxVideoService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
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

  private slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}
