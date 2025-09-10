import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import {
  AdminMangaListQueryDto,
  CreateAdminMangaDto,
  UpdateAdminMangaDto,
} from './dto/admin-manga.dto';

@Injectable()
export class AdminMangasService {
  constructor(private prisma: PrismaService) {}

  async list(query: AdminMangaListQueryDto) {
    const { page = 1, limit = 20, search, annee, editeur, statut } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.titre = { contains: search, mode: 'insensitive' };
    if (annee) where.annee = annee;
    if (editeur) where.editeur = { contains: editeur, mode: 'insensitive' };
    if (statut !== undefined) where.statut = statut;

    const [items, total] = await Promise.all([
      this.prisma.akManga.findMany({ where, skip, take: limit, orderBy: { dateAjout: 'desc' } }),
      this.prisma.akManga.count({ where }),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getOne(id: number) {
    const item = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!item) throw new NotFoundException('Manga introuvable');
    return item;
  }

  async create(dto: CreateAdminMangaDto) {
    const data: any = { ...dto };
    if (!data.niceUrl && data.titre) data.niceUrl = this.slugify(data.titre);
    return this.prisma.akManga.create({ data });
  }

  async update(id: number, dto: UpdateAdminMangaDto, user?: any) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');
    const data: any = { ...dto };
    if (dto.titre && !dto.niceUrl) data.niceUrl = this.slugify(dto.titre);

    // Handle synopsis validation - append user attribution if synopsis is being updated
    if (dto.synopsis && user?.username) {
      // Check if synopsis is being changed (not just updating the same value)
      if (dto.synopsis !== existing.synopsis) {
        // Remove any existing attribution to avoid duplication
        let cleanSynopsis = dto.synopsis;
        const attributionRegex = /<br><br>"Synopsis soumis par .+"/g;
        cleanSynopsis = cleanSynopsis.replace(attributionRegex, '');
        
        // Append the new attribution
        data.synopsis = `${cleanSynopsis}<br><br>"Synopsis soumis par ${user.username}"`;
      }
    }

    return this.prisma.akManga.update({ where: { idManga: id }, data });
  }

  async updateStatus(id: number, statut: number) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');
    return this.prisma.akManga.update({ where: { idManga: id }, data: { statut } });
  }

  async remove(id: number) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');
    await this.prisma.akManga.delete({ where: { idManga: id } });
    return { message: 'Manga supprimé' };
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

