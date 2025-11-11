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
        presentation: true,
        image: true,
        statut: true,
      }
    });

    if (!item) throw new NotFoundException('Jeu vidéo introuvable');

    // Map idJeu to idJeuVideo and presentation to description for frontend consistency
    return {
      ...item,
      idJeuVideo: item.idJeu,
      description: item.presentation,
    };
  }

  async create(dto: CreateAdminJeuxVideoDto, username?: string) {
    const data: any = { ...dto };

    // Map description to presentation for database
    if (data.description !== undefined) {
      data.presentation = data.description;
      delete data.description;
    }

    if (!data.niceUrl && data.titre) {
      data.niceUrl = this.slugify(data.titre);
    }

    const created = await this.prisma.akJeuxVideo.create({ data });

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idJeu, 'jeu_video', username, 'Création fiche');
    }

    return {
      ...created,
      idJeuVideo: created.idJeu,
      description: created.presentation,
    };
  }

  async update(id: number, dto: UpdateAdminJeuxVideoDto, username?: string) {
    const existing = await this.prisma.akJeuxVideo.findUnique({ where: { idJeu: id } });
    if (!existing) throw new NotFoundException('Jeu vidéo introuvable');

    const data: any = { ...dto };

    // Map description to presentation for database
    if (data.description !== undefined) {
      data.presentation = data.description;
      delete data.description;
    }

    if (dto.titre && !dto.niceUrl) {
      data.niceUrl = this.slugify(dto.titre);
    }

    const updated = await this.prisma.akJeuxVideo.update({
      where: { idJeu: id },
      data
    });

    // Log the update
    if (username) {
      await this.adminLogging.addLog(id, 'jeu_video', username, 'Modification infos principales');
    }

    return {
      ...updated,
      idJeuVideo: updated.idJeu,
      description: updated.presentation,
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
