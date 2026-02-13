import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';

@Injectable()
export class AnimeStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getAnimeStaff(id: number) {
    // Try to get from cache first (15 minutes TTL)
    const cacheKey = `anime_staff:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id, statut: 1 },
      select: { idAnime: true },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Get staff/business relations
    const staff = await this.prisma.$queryRaw`
      SELECT
        bs.id_relation as idRelation,
        bs.id_anime as idAnime,
        bs.id_business as idBusiness,
        bs.type,
        bs.precisions,
        b.denomination,
        b.autres_denominations as autresDenominations,
        b.type as businessType,
        b.image,
        b.notes,
        b.origine,
        b.site_officiel as siteOfficiel,
        b.date,
        b.statut
      FROM ak_business_to_animes bs
      JOIN ak_business b ON bs.id_business = b.id_business
      WHERE bs.id_anime = ${id}
      ORDER BY bs.type, b.denomination
    ` as any[];

    const result = {
      anime_id: id,
      staff: staff.map((s: any) => ({
        ...s,
        business: {
          idBusiness: s.idBusiness,
          denomination: s.denomination,
          autresDenominations: s.autresDenominations,
          type: s.businessType,
          image: s.image,
          notes: s.notes,
          origine: s.origine,
          siteOfficiel: s.siteOfficiel,
          date: s.date,
          statut: s.statut,
        },
      })),
    };

    // Cache for 12 hours (43200 seconds)
    await this.cacheService.set(cacheKey, result, 43200);

    return result;
  }

  async getAnimeBusinesses(animeId: number) {
    // Check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Get all business relationships for this anime
    const relationships = await this.prisma.$queryRaw<Array<{
      id_relation: number;
      id_business: number;
      type: string;
      precisions: string | null;
      denomination: string;
      origine: string | null;
    }>>`
      SELECT
        bta.id_relation,
        bta.id_business,
        bta.type,
        bta.precisions,
        b.denomination,
        b.origine
      FROM ak_business_to_animes bta
      INNER JOIN ak_business b ON b.id_business = bta.id_business
      WHERE bta.id_anime = ${animeId}
        AND bta.doublon = 0
      ORDER BY bta.type, b.denomination
    `;

    return relationships.map(rel => ({
      relationId: rel.id_relation,
      businessId: rel.id_business,
      denomination: rel.denomination,
      type: rel.type,
      precisions: rel.precisions,
      origine: rel.origine,
    }));
  }

  async addAnimeBusiness(
    animeId: number,
    businessId: number,
    type: string,
    precisions?: string,
  ) {
    // Check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Check if business exists
    const business = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: businessId },
    });

    if (!business) {
      throw new NotFoundException('Entité business introuvable');
    }

    // Check if relationship already exists
    const existingRelation = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      SELECT id_relation
      FROM ak_business_to_animes
      WHERE id_anime = ${animeId}
        AND id_business = ${businessId}
        AND type = ${type}
        AND doublon = 0
      LIMIT 1
    `;

    if (existingRelation && existingRelation.length > 0) {
      throw new BadRequestException('Cette relation business existe déjà');
    }

    // Create the relationship
    const result = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      INSERT INTO ak_business_to_animes (id_anime, id_business, type, precisions, doublon)
      VALUES (${animeId}, ${businessId}, ${type}, ${precisions || null}, 0)
      RETURNING id_relation
    `;

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(animeId);

    return {
      relationId: result[0].id_relation,
      animeId,
      businessId,
      type,
      precisions,
      denomination: business.denomination,
    };
  }

  async removeAnimeBusiness(animeId: number, businessId: number) {
    // Find the relationship
    const relationship = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      SELECT id_relation
      FROM ak_business_to_animes
      WHERE id_anime = ${animeId}
        AND id_business = ${businessId}
        AND doublon = 0
      LIMIT 1
    `;

    if (!relationship || relationship.length === 0) {
      throw new NotFoundException('Relation business introuvable');
    }

    // Delete the relationship
    await this.prisma.$queryRaw`
      DELETE FROM ak_business_to_animes
      WHERE id_relation = ${relationship[0].id_relation}
    `;

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(animeId);

    return { message: 'Relation business supprimée avec succès' };
  }
}
