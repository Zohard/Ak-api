import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import {
  AdminAnimeListQueryDto,
  CreateAdminAnimeDto,
  UpdateAdminAnimeDto,
} from './dto/admin-anime.dto';

@Injectable()
export class AdminAnimesService {
  constructor(private prisma: PrismaService) {}

  async getOne(id: number) {
    const anime = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!anime) throw new NotFoundException('Anime introuvable');
    return anime;
  }

  async list(query: AdminAnimeListQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      annee,
      studio,
      statut,
      sortBy = 'dateAjout',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { titreOrig: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (annee) where.annee = annee;
    if (studio) where.studio = { contains: studio, mode: 'insensitive' };
    if (statut !== undefined) where.statut = statut;

    const orderBy = { [sortBy]: sortOrder } as any;

    const [items, total] = await Promise.all([
      this.prisma.akAnime.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.akAnime.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(dto: CreateAdminAnimeDto) {
    const data: any = {
      titre: dto.titre,
      niceUrl: dto.niceUrl || this.slugify(dto.titre),
      titreOrig: dto.titreOrig || null,
      annee: dto.annee ?? null,
      nbEp: dto.nbEp ?? null,
      studio: dto.studio || null,
      realisateur: dto.realisateur || null,
      synopsis: dto.synopsis || null,
      image: dto.image || null,
      statut: dto.statut ?? 0,
      dateAjout: new Date(),
    };

    const created = await this.prisma.akAnime.create({ data });
    return created;
  }

  async update(id: number, dto: UpdateAdminAnimeDto) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');

    const data: any = { ...dto };
    if (dto.titre) {
      data.titre = dto.titre;
      if (!dto.niceUrl) data.niceUrl = this.slugify(dto.titre);
    }

    const updated = await this.prisma.akAnime.update({ where: { idAnime: id }, data });
    return updated;
  }

  async updateStatus(id: number, statut: number) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');
    return this.prisma.akAnime.update({ where: { idAnime: id }, data: { statut } });
  }

  async remove(id: number) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');
    await this.prisma.akAnime.delete({ where: { idAnime: id } });
    return { message: 'Anime supprimé' };
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
