import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminBusinessListQueryDto, CreateAdminBusinessDto, UpdateAdminBusinessDto } from './dto/admin-business.dto';

@Injectable()
export class AdminBusinessService {
  constructor(private prisma: PrismaService) {}

  async list(query: AdminBusinessListQueryDto) {
    const { page = 1, statut, search, type } = query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (statut !== undefined) where.statut = statut;
    if (type) where.type = { contains: type, mode: 'insensitive' };
    if (search) where.denomination = { contains: search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.akBusiness.findMany({ where, skip, take: limit, orderBy: { dateAjout: 'desc' } }),
      this.prisma.akBusiness.count({ where }),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getOne(id: number) {
    const item = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!item) throw new NotFoundException('Fiche business introuvable');
    return item;
  }

  async create(dto: CreateAdminBusinessDto) {
    const data: any = { ...dto };
    if (!data.niceUrl && data.denomination) data.niceUrl = this.slugify(data.denomination);
    return this.prisma.akBusiness.create({ data });
  }

  async update(id: number, dto: UpdateAdminBusinessDto) {
    const existing = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!existing) throw new NotFoundException('Fiche business introuvable');
    const data: any = { ...dto };
    if (dto.denomination && !dto.niceUrl) data.niceUrl = this.slugify(dto.denomination);
    return this.prisma.akBusiness.update({ where: { idBusiness: id }, data });
  }

  async updateStatus(id: number, statut: number) {
    const existing = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!existing) throw new NotFoundException('Fiche business introuvable');
    return this.prisma.akBusiness.update({ where: { idBusiness: id }, data: { statut } });
  }

  async remove(id: number) {
    const existing = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!existing) throw new NotFoundException('Fiche business introuvable');
    await this.prisma.akBusiness.delete({ where: { idBusiness: id } });
    return { message: 'Business supprimé' };
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

