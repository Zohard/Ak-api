import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminLoggingService } from '../logging/admin-logging.service';

interface AniListCommentaireData {
  anilistId?: number;
  originalData?: {
    genres?: string[];
    description?: string;
  };
  staff?: Array<{
    name: string;
    role: string;
    primaryOccupations?: string[];
  }>;
  characters?: Array<{
    name: string;
    role: string;
    voiceActors?: Array<{
      name: string;
      language: string;
    }>;
  }>;
}

interface ImportResult {
  tagsImported: number;
  tagsSkipped: number;
  staffImported: number;
  staffSkipped: number;
  details: {
    tags: string[];
    staff: string[];
    skippedTags: string[];
    skippedStaff: string[];
  };
}

@Injectable()
export class AniListImportService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
  ) {}

  /**
   * Import tags from AniList data stored in commentaire field
   */
  async importTags(animeId: number, username?: string): Promise<{ imported: number; skipped: number; details: string[] }> {
    // Get anime with commentaire
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { idAnime: true, titre: true, commentaire: true },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    if (!anime.commentaire) {
      throw new BadRequestException('Aucune donnée AniList disponible (champ commentaire vide)');
    }

    let anilistData: AniListCommentaireData;
    try {
      anilistData = JSON.parse(anime.commentaire);
    } catch {
      throw new BadRequestException('Format de données AniList invalide');
    }

    const genres = anilistData.originalData?.genres || [];
    if (genres.length === 0) {
      return { imported: 0, skipped: 0, details: ['Aucun genre trouvé dans les données AniList'] };
    }

    const imported: string[] = [];
    const skipped: string[] = [];

    for (const genre of genres) {
      try {
        // Check if tag exists
        const existingTag = await this.prisma.$queryRaw<any[]>`
          SELECT id_tag, tag_name FROM ak_tags WHERE LOWER(tag_name) = LOWER(${genre}) LIMIT 1
        `;

        let tagId: number;

        if (existingTag.length === 0) {
          // Create tag
          const tagNiceUrl = this.slugify(genre);
          const result = await this.prisma.$queryRaw<any[]>`
            INSERT INTO ak_tags (tag_name, tag_nice_url, categorie)
            VALUES (${genre}, ${tagNiceUrl}, 'Genre')
            RETURNING id_tag
          `;
          tagId = result[0].id_tag;
        } else {
          tagId = existingTag[0].id_tag;
        }

        // Check if anime-tag relation exists
        const existingRelation = await this.prisma.$queryRaw<any[]>`
          SELECT id_tag FROM ak_tag2fiche
          WHERE id_tag = ${tagId} AND id_fiche = ${animeId} AND type = 'anime'
          LIMIT 1
        `;

        if (existingRelation.length === 0) {
          // Create relation
          await this.prisma.$queryRaw`
            INSERT INTO ak_tag2fiche (id_tag, id_fiche, type)
            VALUES (${tagId}, ${animeId}, 'anime')
          `;
          imported.push(genre);
        } else {
          skipped.push(`${genre} (déjà lié)`);
        }
      } catch (error) {
        skipped.push(`${genre} (erreur: ${error.message})`);
      }
    }

    // Log the import
    if (username && imported.length > 0) {
      await this.adminLogging.addLog(
        animeId,
        'anime',
        username,
        `Import tags AniList: ${imported.join(', ')}`,
      );
    }

    return {
      imported: imported.length,
      skipped: skipped.length,
      details: [...imported.map(t => `✓ ${t}`), ...skipped.map(t => `⊘ ${t}`)],
    };
  }

  /**
   * Import staff from AniList data stored in commentaire field
   */
  async importStaff(
    animeId: number,
    options: { includeVoiceActors?: boolean; roles?: string[] } = {},
    username?: string,
  ): Promise<{ imported: number; skipped: number; details: string[] }> {
    const { includeVoiceActors = false, roles } = options;

    // Get anime with commentaire
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { idAnime: true, titre: true, commentaire: true },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    if (!anime.commentaire) {
      throw new BadRequestException('Aucune donnée AniList disponible (champ commentaire vide)');
    }

    let anilistData: AniListCommentaireData;
    try {
      anilistData = JSON.parse(anime.commentaire);
    } catch {
      throw new BadRequestException('Format de données AniList invalide');
    }

    const staffList = anilistData.staff || [];
    const characters = anilistData.characters || [];

    if (staffList.length === 0 && characters.length === 0) {
      return { imported: 0, skipped: 0, details: ['Aucun staff trouvé dans les données AniList'] };
    }

    const imported: string[] = [];
    const skipped: string[] = [];

    // Process staff members
    for (const staff of staffList) {
      try {
        // Filter by role if specified
        if (roles && roles.length > 0) {
          const roleMatch = roles.some(r =>
            staff.role?.toLowerCase().includes(r.toLowerCase()) ||
            staff.primaryOccupations?.some(o => o.toLowerCase().includes(r.toLowerCase()))
          );
          if (!roleMatch) {
            skipped.push(`${staff.name} (rôle non sélectionné: ${staff.role})`);
            continue;
          }
        }

        const result = await this.addStaffToAnime(animeId, staff.name, this.mapRoleToType(staff.role));
        if (result.created) {
          imported.push(`${staff.name} (${staff.role})`);
        } else {
          skipped.push(`${staff.name} (${result.reason})`);
        }
      } catch (error) {
        skipped.push(`${staff.name} (erreur: ${error.message})`);
      }
    }

    // Process voice actors if requested
    if (includeVoiceActors) {
      for (const character of characters) {
        const japaneseVA = character.voiceActors?.find(va => va.language === 'Japanese');
        if (japaneseVA) {
          try {
            const result = await this.addStaffToAnime(
              animeId,
              japaneseVA.name,
              'Doubleur japonais',
              `Voix de ${character.name}`,
            );
            if (result.created) {
              imported.push(`${japaneseVA.name} (Doubleur - ${character.name})`);
            } else {
              skipped.push(`${japaneseVA.name} (${result.reason})`);
            }
          } catch (error) {
            skipped.push(`${japaneseVA.name} (erreur: ${error.message})`);
          }
        }
      }
    }

    // Log the import
    if (username && imported.length > 0) {
      await this.adminLogging.addLog(
        animeId,
        'anime',
        username,
        `Import staff AniList: ${imported.length} personnes`,
      );
    }

    return {
      imported: imported.length,
      skipped: skipped.length,
      details: [...imported.map(t => `✓ ${t}`), ...skipped.map(t => `⊘ ${t}`)],
    };
  }

  /**
   * Import both tags and staff from AniList data
   */
  async importAll(
    animeId: number,
    options: { includeVoiceActors?: boolean; staffRoles?: string[] } = {},
    username?: string,
  ): Promise<ImportResult> {
    const tagsResult = await this.importTags(animeId, username);
    const staffResult = await this.importStaff(animeId, {
      includeVoiceActors: options.includeVoiceActors,
      roles: options.staffRoles,
    }, username);

    return {
      tagsImported: tagsResult.imported,
      tagsSkipped: tagsResult.skipped,
      staffImported: staffResult.imported,
      staffSkipped: staffResult.skipped,
      details: {
        tags: tagsResult.details.filter(d => d.startsWith('✓')),
        staff: staffResult.details.filter(d => d.startsWith('✓')),
        skippedTags: tagsResult.details.filter(d => d.startsWith('⊘')),
        skippedStaff: staffResult.details.filter(d => d.startsWith('⊘')),
      },
    };
  }

  /**
   * Get AniList data preview for an anime (without importing)
   */
  async getAniListDataPreview(animeId: number): Promise<{
    hasData: boolean;
    anilistId?: number;
    genres: string[];
    staff: Array<{ name: string; role: string }>;
    characters: Array<{ name: string; role: string; voiceActor?: string }>;
  }> {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { idAnime: true, titre: true, commentaire: true },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    if (!anime.commentaire) {
      return { hasData: false, genres: [], staff: [], characters: [] };
    }

    try {
      const anilistData: AniListCommentaireData = JSON.parse(anime.commentaire);
      return {
        hasData: true,
        anilistId: anilistData.anilistId,
        genres: anilistData.originalData?.genres || [],
        staff: (anilistData.staff || []).map(s => ({ name: s.name, role: s.role })),
        characters: (anilistData.characters || []).map(c => ({
          name: c.name,
          role: c.role,
          voiceActor: c.voiceActors?.find(va => va.language === 'Japanese')?.name,
        })),
      };
    } catch {
      return { hasData: false, genres: [], staff: [], characters: [] };
    }
  }

  /**
   * Add a staff member to an anime (creates business if needed)
   */
  private async addStaffToAnime(
    animeId: number,
    name: string,
    type: string,
    precisions?: string,
  ): Promise<{ created: boolean; businessId?: number; reason?: string }> {
    // Check if business exists
    const existingBusiness = await this.prisma.$queryRaw<any[]>`
      SELECT id_business, denomination FROM ak_business
      WHERE LOWER(denomination) = LOWER(${name})
      OR LOWER(autres_denominations) LIKE LOWER(${`%${name}%`})
      LIMIT 1
    `;

    let businessId: number;

    if (existingBusiness.length === 0) {
      // Create business
      const niceUrl = this.slugify(name);
      const result = await this.prisma.$queryRaw<any[]>`
        INSERT INTO ak_business (denomination, nice_url, type, statut)
        VALUES (${name}, ${niceUrl}, 'Personne', 1)
        RETURNING id_business
      `;
      businessId = result[0].id_business;
    } else {
      businessId = existingBusiness[0].id_business;
    }

    // Check if relation exists
    const existingRelation = await this.prisma.$queryRaw<any[]>`
      SELECT id_relation FROM ak_business_to_animes
      WHERE id_anime = ${animeId} AND id_business = ${businessId}
      LIMIT 1
    `;

    if (existingRelation.length > 0) {
      return { created: false, businessId, reason: 'déjà lié' };
    }

    // Create relation
    await this.prisma.$queryRaw`
      INSERT INTO ak_business_to_animes (id_anime, id_business, type, precisions, doublon)
      VALUES (${animeId}, ${businessId}, ${type}, ${precisions || null}, 0)
    `;

    return { created: true, businessId };
  }

  /**
   * Map AniList role to database type
   */
  private mapRoleToType(role: string): string {
    const roleLower = role?.toLowerCase() || '';

    if (roleLower.includes('director') && !roleLower.includes('art') && !roleLower.includes('sound')) {
      return 'Réalisateur';
    }
    if (roleLower.includes('original creator') || roleLower.includes('original story')) {
      return 'Auteur original';
    }
    if (roleLower.includes('script') || roleLower.includes('screenplay') || roleLower.includes('series composition')) {
      return 'Scénariste';
    }
    if (roleLower.includes('character design')) {
      return 'Character designer';
    }
    if (roleLower.includes('music') || roleLower.includes('composer')) {
      return 'Compositeur';
    }
    if (roleLower.includes('art director')) {
      return 'Directeur artistique';
    }
    if (roleLower.includes('animation director')) {
      return 'Directeur animation';
    }
    if (roleLower.includes('producer')) {
      return 'Producteur';
    }
    if (roleLower.includes('sound director')) {
      return 'Directeur son';
    }
    if (roleLower.includes('storyboard')) {
      return 'Storyboard';
    }

    return 'Staff';
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}
