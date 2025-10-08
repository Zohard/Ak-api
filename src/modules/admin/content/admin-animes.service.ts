import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import {
  AdminAnimeListQueryDto,
  CreateAdminAnimeDto,
  UpdateAdminAnimeDto,
} from './dto/admin-anime.dto';

@Injectable()
export class AdminAnimesService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
  ) {}

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
      format,
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
    if (format) where.format = { contains: format, mode: 'insensitive' };
    if (statut !== undefined) where.statut = statut;

    // Sort "En attente" (status 2) first, then by the requested sort
    const orderBy = [
      { statut: 'desc' as const }, // This puts 2 (En attente) before 1 (Publié) and 0 (Refusé)
      { [sortBy]: sortOrder }
    ] as any;

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

  async create(dto: CreateAdminAnimeDto, username?: string) {
    // Normalize legacy fields
    const titreOrig = dto.titreOrig ?? dto.titre_orig ?? null;
    const normalizeFormat = (val?: string | null) => {
      if (!val) return val ?? null;
      const t = val.trim();
      if (/^série$/i.test(t)) return 'Série TV';
      return t;
    };
    let nbEp: number | null = null;
    if (typeof dto.nbEp === 'number') {
      nbEp = dto.nbEp;
    } else if (dto.nbEpduree || dto.nb_epduree) {
      const episodeString = dto.nbEpduree || dto.nb_epduree;
      const m = String(episodeString).match(/\d+/);
      if (m) nbEp = Number(m[0]);
    }

    const data: any = {
      titre: dto.titre,
      niceUrl: dto.niceUrl || this.slugify(dto.titre),
      titreOrig,
      annee: dto.annee ?? null,
      nbEp,
      studio: dto.studio || null,
      realisateur: dto.realisateur || null,
      synopsis: dto.synopsis || null,
      image: dto.image || null,
      statut: dto.statut ?? 0,
      dateAjout: new Date(),
    };

    // Additional legacy fields if provided
    if (dto.format) data.format = normalizeFormat(dto.format);
    if (typeof dto.licence === 'number') data.licence = dto.licence;
    if (dto.titre_fr) data.titreFr = dto.titre_fr;
    if (dto.titres_alternatifs) data.titresAlternatifs = dto.titres_alternatifs;
    if (dto.titresAlternatifs) data.titresAlternatifs = dto.titresAlternatifs;
    // Handle both camelCase and snake_case versions
    const episodeCount = dto.nbEpduree || dto.nb_epduree;
    if (episodeCount) data.nbEpduree = episodeCount;

    const officialSite = dto.officialSite || dto.official_site;
    if (officialSite) data.officialSite = officialSite;
    if (dto.lien_adn) data.lienAdn = dto.lien_adn;
    if (dto.doublage) data.doublage = dto.doublage;
    if (dto.commentaire) data.commentaire = dto.commentaire;
    // Note: legacy `topic` is not supported; use `commentaire` instead

    const created = await this.prisma.akAnime.create({ data });

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idAnime, 'anime', username, 'Création fiche');
    }

    return created;
  }

  async update(id: number, dto: UpdateAdminAnimeDto, user?: any) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');

    const { topic, ...rest } = dto as any;
    const data: any = { ...rest };
    if (dto.titre) {
      data.titre = dto.titre;
      if (!dto.niceUrl) data.niceUrl = this.slugify(dto.titre);
    }

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

    // Normalize format if provided
    if (data.format) {
      const t = String(data.format).trim();
      data.format = /^série$/i.test(t) ? 'Série TV' : t;
    }

    const updated = await this.prisma.akAnime.update({ where: { idAnime: id }, data });

    // Log the update
    if (user) {
      const username = user.pseudo || user.member_name || user.username || 'admin';
      await this.adminLogging.addLog(id, 'anime', username, 'Modification infos principales');
    }

    return updated;
  }

  async updateStatus(id: number, statut: number, username?: string) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');

    const updated = await this.prisma.akAnime.update({ where: { idAnime: id }, data: { statut } });

    // Log the status change
    if (username) {
      await this.adminLogging.addLog(id, 'anime', username, `Modification statut (${statut})`);
    }

    return updated;
  }

  async remove(id: number) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');
    await this.prisma.akAnime.delete({ where: { idAnime: id } });
    return { message: 'Anime supprimé' };
  }

  async createStaffFromImportData(animeId: number, staffData: Array<{ name: string; role: string }>): Promise<void> {
    if (!staffData || staffData.length === 0) return;

    for (const staffMember of staffData) {
      if (!staffMember.name?.trim() || !staffMember.role?.trim()) continue;

      try {
        // First, try to find existing business entity by denomination
        let business = await this.prisma.akBusiness.findFirst({
          where: {
            denomination: {
              equals: staffMember.name,
              mode: 'insensitive'
            }
          }
        });

        // If not found, create new business entity
        if (!business) {
          business = await this.prisma.akBusiness.create({
            data: {
              denomination: staffMember.name,
              type: this.getBusinessTypeFromRole(staffMember.role),
              statut: 1,
              dateAjout: new Date()
            }
          });
        }

        // Check if relationship already exists
        const existingRelation = await this.prisma.akBusinessToAnime.findFirst({
          where: {
            idAnime: animeId,
            idBusiness: business.idBusiness,
            type: staffMember.role
          }
        });

        // Create relationship if it doesn't exist
        if (!existingRelation) {
          await this.prisma.akBusinessToAnime.create({
            data: {
              idAnime: animeId,
              idBusiness: business.idBusiness,
              type: staffMember.role
            }
          });
        }
      } catch (error) {
        console.error(`Error creating staff member ${staffMember.name} with role ${staffMember.role}:`, error);
        // Continue with next staff member instead of failing entire operation
      }
    }
  }

  private getBusinessTypeFromRole(role: string): string {
    const roleMap: Record<string, string> = {
      'Studio d\'animation': 'Studio',
      'Studio d\'animation (sous-traitance)': 'Studio',
      'Réalisateur': 'Personne',
      'Director': 'Personne',
      'Character Design': 'Personne',
      'Music': 'Personne',
      'Original Creator': 'Personne',
      'Script': 'Personne',
      'Producer': 'Personne',
      'Executive Producer': 'Personne',
      'Sound Director': 'Personne',
      'Art Director': 'Personne',
    };

    return roleMap[role] || 'Personne';
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
