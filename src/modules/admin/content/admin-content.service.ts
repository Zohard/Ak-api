import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { ContentAdminQueryDto } from './dto/content-admin-query.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import {
  CreateContentRelationshipDto,
  UpdateContentRelationshipDto,
} from './dto/content-relationship.dto';
import { AdminLoggingService } from '../logging/admin-logging.service';

@Injectable()
export class AdminContentService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
  ) { }

  async getAllContent(query: ContentAdminQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      type,
      sort = 'date_ajout',
      order = 'DESC',
    } = query;
    const offset = (page - 1) * limit;

    // Determine which tables to query based on type filter
    const tables = type ? [type] : ['anime', 'manga', 'business'];
    const results: any[] = [];

    for (const contentType of tables) {
      const columnMap = {
        anime: {
          table: 'ak_animes',
          id: 'id_anime',
          title: 'titre',
          status: 'statut',
          dateAdd: 'date_ajout',
          reviews: 'nb_reviews',
          rating: 'moyennenotes',
        },
        manga: {
          table: 'ak_mangas',
          id: 'id_manga',
          title: 'titre',
          status: 'statut',
          dateAdd: 'date_ajout',
          reviews: 'nb_reviews',
          rating: 'moyennenotes',
        },
        business: {
          table: 'ak_business',
          id: 'id_business',
          title: 'nom',
          status: 'statut',
          dateAdd: 'date_ajout',
          reviews: '0 as nb_reviews',
          rating: '0 as moyennenotes',
        },
      };

      const config = columnMap[contentType];
      if (!config) continue;

      // Build WHERE conditions
      const whereConditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (search) {
        whereConditions.push(`${config.title} ILIKE $${paramIndex}`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status && status !== 'all') {
        whereConditions.push(`${config.status} = $${paramIndex}`);
        params.push(parseInt(status));
        paramIndex++;
      }

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

      // Get content for this type
      const contentQuery = `
        SELECT 
          ${config.id} as id,
          ${config.title} as titre,
          ${config.status} as statut,
          ${config.dateAdd} as date_ajout,
          ${config.rating} as note_moyenne,
          ${config.reviews} as nb_critiques,
          '${contentType}' as content_type
        FROM ${config.table}
        ${whereClause}
        ORDER BY ${sort} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      try {
        const content = await this.prisma.$queryRawUnsafe(
          contentQuery,
          ...params,
        );
        results.push(...(content as any[]));
      } catch (error) {
        console.error(`Error querying ${contentType}:`, error);
      }
    }

    // Sort combined results
    results.sort((a, b) => {
      const aValue = a[sort];
      const bValue = b[sort];
      if (order === 'DESC') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Apply pagination to combined results
    const paginatedResults = results.slice(offset, offset + limit);
    const total = results.length;
    const totalPages = Math.ceil(total / limit);

    return {
      content: paginatedResults,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getContentById(id: number, type: string) {
    const columnMap = {
      anime: {
        table: 'ak_animes',
        id: 'id_anime',
      },
      manga: {
        table: 'ak_mangas',
        id: 'id_manga',
      },
      'jeu-video': {
        table: 'ak_jeux_video',
        id: 'id_jeu',
      },
      business: {
        table: 'ak_business',
        id: 'id_business',
      },
    };

    const config = columnMap[type];
    if (!config) {
      throw new BadRequestException('Invalid content type');
    }

    const content = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM ${config.table} WHERE ${config.id} = $1`,
      id,
    );

    if (!content || (content as any[]).length === 0) {
      throw new NotFoundException(`${type} with ID ${id} not found`);
    }

    // Get additional data based on type
    const result = (content as any[])[0];

    if (type === 'anime' || type === 'manga') {
      // Get screenshots/covers using id_titre column
      const media = await this.prisma.$queryRawUnsafe(
        `SELECT * FROM ak_screenshots WHERE id_titre = $1`,
        id,
      );
      result.media = media;

      // Get relationships
      const relations = await this.getContentRelationships(id, type);
      result.relations = relations;

      // Get business relationships (staff)
      const staff = await this.getContentStaff(id, type);
      result.staff = staff;

      // Get tags
      const tags = await this.getContentTags(id, type);
      result.tags = tags;
    }

    return result;
  }

  async updateContentStatus(
    id: number,
    type: string,
    status: number,
    adminId: number,
  ) {
    const columnMap = {
      anime: {
        table: 'ak_animes',
        id: 'id_anime',
      },
      manga: {
        table: 'ak_mangas',
        id: 'id_manga',
      },
      business: {
        table: 'ak_business',
        id: 'id_business',
      },
      article: {
        table: 'ak_webzine_articles',
        id: 'id',
      },
    };

    const config = columnMap[type];
    if (!config) {
      throw new BadRequestException('Invalid content type');
    }

    await this.prisma.$queryRawUnsafe(
      `UPDATE ${config.table} SET statut = $1 WHERE ${config.id} = $2`,
      status,
      id,
    );

    // Log admin action
    // Log removed

    return { message: `${type} status updated successfully` };
  }

  async deleteContent(id: number, type: string, adminId: number) {
    const columnMap = {
      anime: {
        table: 'ak_animes',
        id: 'id_anime',
      },
      manga: {
        table: 'ak_mangas',
        id: 'id_manga',
      },
      business: {
        table: 'ak_business',
        id: 'id_business',
      },
      article: {
        table: 'ak_webzine_articles',
        id: 'id',
      },
    };

    const config = columnMap[type];
    if (!config) {
      throw new BadRequestException('Invalid content type');
    }

    // Check if content exists
    const content = await this.getContentById(id, type);
    if (!content) {
      throw new NotFoundException(`${type} with ID ${id} not found`);
    }

    // Delete related data first (cascade)
    if (type === 'anime' || type === 'manga') {
      // Delete reviews
      const reviewIdColumn = type === 'anime' ? 'id_anime' : 'id_manga';
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM ak_critique WHERE ${reviewIdColumn} = $1`,
        id,
      );

      // Delete screenshots/covers
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM ak_screenshots WHERE id_titre = $1`,
        id,
      );

      // Delete relationships (as source or as target)
      if (type === 'anime') {
        await this.prisma.$queryRawUnsafe(
          `DELETE FROM ak_fiche_to_fiche WHERE id_fiche_depart = $1 OR id_anime = $2`,
          `anime${id}`,
          id,
        );
      } else {
        await this.prisma.$queryRawUnsafe(
          `DELETE FROM ak_fiche_to_fiche WHERE id_fiche_depart = $1 OR id_manga = $2`,
          `manga${id}`,
          id,
        );
      }

      // Delete business relationships
      const staffTable =
        type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
      const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM ${staffTable} WHERE ${idColumn} = $1`,
        id,
      );

      // Delete tags
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM ak_tag2fiche WHERE id_fiche = $1 AND type = $2`,
        id,
        type,
      );
    }

    // Delete the main content
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM ${config.table} WHERE ${config.id} = $1`,
      id,
    );

    // Log admin action
    // Log removed

    return { message: `${type} deleted successfully` };
  }

  async performBulkAction(bulkAction: BulkActionDto, adminId: number) {
    const { ids, action, contentType } = bulkAction;
    const results: Array<{ id: number; status: string; message: string }> = [];

    for (const id of ids) {
      try {
        switch (action) {
          case 'activate':
            await this.updateContentStatus(id, contentType, 1, adminId);
            results.push({ id, status: 'success', message: 'Activated' });
            break;
          case 'deactivate':
            await this.updateContentStatus(id, contentType, 0, adminId);
            results.push({ id, status: 'success', message: 'Deactivated' });
            break;
          case 'delete':
            await this.deleteContent(id, contentType, adminId);
            results.push({ id, status: 'success', message: 'Deleted' });
            break;
          default:
            results.push({ id, status: 'error', message: 'Invalid action' });
        }
      } catch (error) {
        results.push({
          id,
          status: 'error',
          message: error.message || 'Unknown error',
        });
      }
    }

    return {
      message: 'Bulk action completed',
      results,
    };
  }

  async getContentRelationships(id: number, type: string) {
    // Relationships are stored with the source in id_fiche_depart as 'anime<ID>', 'manga<ID>', or 'jeu<ID>'
    // We query BIDIRECTIONALLY: both where this content is the source AND where it's the target
    const sourceKey = type === 'jeu-video' ? `jeu${id}` : `${type}${id}`;

    // Build the WHERE clause dynamically based on type
    let whereClause: string;
    if (type === 'anime') {
      whereClause = `WHERE r.id_fiche_depart = $1 OR r.id_anime = $2`;
    } else if (type === 'manga') {
      whereClause = `WHERE r.id_fiche_depart = $1 OR r.id_manga = $2`;
    } else if (type === 'jeu-video') {
      whereClause = `WHERE r.id_fiche_depart = $1 OR r.id_jeu = $2`;
    } else {
      whereClause = `WHERE r.id_fiche_depart = $1`;
    }

    try {
      // Filter to anime/manga/jeu relationships
      const relationships = await this.prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          base.id_relation,
          base.id_fiche_depart,
          base.id_anime,
          base.id_manga,
          base.related_id,
          base.related_type,
          base.type_relation,
          COALESCE(a.titre, m.titre, j.titre) as related_title
        FROM (
          SELECT
            r.id_relation,
            r.id_fiche_depart,
            r.id_anime,
            r.id_manga,
            CASE
              WHEN r.id_fiche_depart = $1 THEN
                CASE
                  WHEN r.id_anime > 0 THEN r.id_anime
                  WHEN r.id_manga > 0 THEN r.id_manga
                  WHEN r.id_jeu > 0 THEN r.id_jeu
                  ELSE NULL
                END
              WHEN r.id_fiche_depart ~ '^anime[0-9]+$' THEN CAST(SUBSTRING(r.id_fiche_depart, 6) AS INTEGER)
              WHEN r.id_fiche_depart ~ '^manga[0-9]+$' THEN CAST(SUBSTRING(r.id_fiche_depart, 6) AS INTEGER)
              WHEN r.id_fiche_depart ~ '^jeu[0-9]+$' THEN CAST(SUBSTRING(r.id_fiche_depart, 4) AS INTEGER)
              ELSE NULL
            END as related_id,
            'related'::text as type_relation,
            CASE
              WHEN r.id_fiche_depart = $1 THEN
                CASE
                  WHEN r.id_anime > 0 THEN 'anime'::text
                  WHEN r.id_manga > 0 THEN 'manga'::text
                  WHEN r.id_jeu > 0 THEN 'jeu-video'::text
                  ELSE 'unknown'::text
                END
              WHEN r.id_fiche_depart ~ '^anime[0-9]+$' THEN 'anime'::text
              WHEN r.id_fiche_depart ~ '^manga[0-9]+$' THEN 'manga'::text
              WHEN r.id_fiche_depart ~ '^jeu[0-9]+$' THEN 'jeu-video'::text
              ELSE 'unknown'::text
            END as related_type
          FROM ak_fiche_to_fiche r
          ${whereClause}
          AND (r.id_anime > 0 OR r.id_manga > 0 OR r.id_jeu > 0 OR r.id_fiche_depart ~ '^anime[0-9]+$' OR r.id_fiche_depart ~ '^manga[0-9]+$' OR r.id_fiche_depart ~ '^jeu[0-9]+$')
        ) base
        LEFT JOIN ak_animes a ON base.related_type = 'anime' AND base.related_id = a.id_anime
        LEFT JOIN ak_mangas m ON base.related_type = 'manga' AND base.related_id = m.id_manga
        LEFT JOIN ak_jeux_video j ON base.related_type = 'jeu-video' AND base.related_id = j.id_jeu
        WHERE base.related_id IS NOT NULL
      `,
        sourceKey,
        id,
      );

      // Return relationships without tags to avoid performance issues
      // Tags can be fetched separately if needed
      return relationships;
    } catch (error) {
      console.error('Error fetching content relationships:', error);
      throw new BadRequestException(`Failed to fetch relationships for ${type} with ID ${id}`);
    }
  }

  // Lightweight check if content exists (no heavy data loading)
  private async contentExists(id: number, type: string): Promise<boolean> {
    const columnMap: Record<string, { table: string; id: string }> = {
      anime: { table: 'ak_animes', id: 'id_anime' },
      manga: { table: 'ak_mangas', id: 'id_manga' },
      'jeu-video': { table: 'ak_jeux_video', id: 'id_jeu' },
      business: { table: 'ak_business', id: 'id_business' },
    };

    const config = columnMap[type];
    if (!config) return false;

    const result = await this.prisma.$queryRawUnsafe(
      `SELECT 1 FROM ${config.table} WHERE ${config.id} = $1 LIMIT 1`,
      id,
    );
    return (result as any[]).length > 0;
  }

  async createContentRelationship(
    id: number,
    type: string,
    relationshipDto: CreateContentRelationshipDto,
  ) {
    const { related_id, related_type, relation_type, description } =
      relationshipDto;

    // Lightweight existence check (parallel)
    const [sourceExists, targetExists] = await Promise.all([
      this.contentExists(id, type),
      this.contentExists(related_id, related_type),
    ]);

    if (!sourceExists) {
      throw new NotFoundException(`${type} with ID ${id} not found`);
    }
    if (!targetExists) {
      throw new NotFoundException(`${related_type} with ID ${related_id} not found`);
    }

    // Create relationship following actual schema:
    // - id_fiche_depart stores the source as 'anime<ID>', 'manga<ID>', or 'jeu<ID>'
    // - id_anime, id_manga, or id_jeu stores the related target id
    const sourceKey = type === 'jeu-video' ? `jeu${id}` : `${type}${id}`;
    const targetAnimeId = related_type === 'anime' ? related_id : 0;
    const targetMangaId = related_type === 'manga' ? related_id : 0;
    const targetJeuId = related_type === 'jeu-video' ? related_id : 0;

    try {
      // Check if relationship already exists
      const existing = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT 1 FROM ak_fiche_to_fiche WHERE id_fiche_depart = $1 AND id_anime = $2 AND id_manga = $3 AND id_jeu = $4 LIMIT 1`,
        sourceKey,
        targetAnimeId,
        targetMangaId,
        targetJeuId,
      );

      if (existing.length > 0) {
        return { message: 'Relationship already exists' };
      }

      // Note: Some legacy DBs have NOT NULL without defaults on id_ost/id_jeu/id_business
      // so we insert explicit zeros to satisfy constraints.
      await this.prisma.$queryRaw`
        INSERT INTO ak_fiche_to_fiche (
          id_fiche_depart,
          id_anime,
          id_manga,
          id_ost,
          id_jeu,
          id_business
        ) VALUES (
          ${sourceKey},
          ${targetAnimeId},
          ${targetMangaId},
          0,
          ${targetJeuId},
          0
        )
      `;

      return { message: 'Relationship created successfully' };
    } catch (error) {
      console.error('Error creating relationship:', error);
      throw new BadRequestException(`Failed to create relationship: ${error.message}`);
    }
  }

  async deleteContentRelationship(relationshipId: number) {
    await this.prisma.$queryRaw`
      DELETE FROM ak_fiche_to_fiche WHERE id_relation = ${relationshipId}
    `;

    return { message: 'Relationship deleted successfully' };
  }

  async getContentStaff(id: number, type: string) {
    const staffTable =
      type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
    const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';

    const staff = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        bs.*,
        b.denomination as nom,
        bs.type as role,
        b.type as business_type,
        b.notes as description
      FROM ${staffTable} bs
      JOIN ak_business b ON bs.id_business = b.id_business
      WHERE bs.${idColumn} = $1
    `,
      id,
    );

    return staff;
  }

  async addContentStaff(
    id: number,
    type: string,
    businessId: number,
    role?: string,
    username?: string,
  ) {
    const staffTable =
      type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
    const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';

    // Prevent duplicates (same business with same role)
    const existing = await this.prisma.$queryRawUnsafe(
      `SELECT 1 FROM ${staffTable} WHERE ${idColumn} = $1 AND id_business = $2 AND type = $3 LIMIT 1`,
      id,
      businessId,
      role || null,
    );
    if ((existing as any[]).length > 0) {
      return { message: 'Staff member already attached with this role' };
    }

    await this.prisma.$queryRawUnsafe(
      `
      INSERT INTO ${staffTable} (${idColumn}, id_business, type, precisions, doublon)
      VALUES ($1, $2, $3, $4, $5)
    `,
      id,
      businessId,
      role || null,
      null, // precisions
      0,    // doublon
    );

    // Log the action
    if (username) {
      const logMessage = role
        ? `Ajout staff B#${businessId} (${role}) `
        : `Ajout staff B#${businessId}`;
      await this.adminLogging.addLog(id, type as 'anime' | 'manga', username, logMessage);
    }

    return { message: 'Staff member added successfully' };
  }

  async removeContentStaff(id: number, type: string, businessId: number, role?: string, username?: string) {
    const staffTable =
      type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
    const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';

    if (role) {
      // Remove specific role only
      await this.prisma.$queryRawUnsafe(
        `
        DELETE FROM ${staffTable}
        WHERE ${idColumn} = $1 AND id_business = $2 AND type = $3
      `,
        id,
        businessId,
        role,
      );
    } else {
      // Remove all roles for this business (fallback for compatibility)
      await this.prisma.$queryRawUnsafe(
        `
        DELETE FROM ${staffTable}
        WHERE ${idColumn} = $1 AND id_business = $2
      `,
        id,
        businessId,
      );
    }

    // Log the action
    if (username) {
      await this.adminLogging.addLog(id, type as 'anime' | 'manga', username, 'Suppression staff (?)');
    }

    return { message: 'Staff member removed successfully' };
  }

  async getContentTags(id: number, type: string) {
    const tags = await this.prisma.$queryRaw`
      SELECT
        t.id_tag as id,
        t.tag_name as nom,
        t.description
      FROM ak_tag2fiche tf
      JOIN ak_tags t ON tf.id_tag = t.id_tag
      WHERE tf.id_fiche = ${id} AND tf.type = ${type}
    `;

    return tags;
  }

  async addContentTag(id: number, type: string, tagId: number, username: string) {
    // Prevent duplicates
    const exists = await this.prisma.$queryRawUnsafe(
      `SELECT 1 FROM ak_tag2fiche WHERE id_fiche = $1 AND type = $2 AND id_tag = $3 LIMIT 1`,
      id,
      type,
      tagId,
    );
    if ((exists as any[]).length > 0) {
      return { message: 'Tag already attached' };
    }

    await this.prisma.$queryRaw`
      INSERT INTO ak_tag2fiche (id_fiche, type, id_tag)
      VALUES (${id}, ${type}, ${tagId})
    `;

    // Log the action
    await this.adminLogging.addLog(id, type as 'anime' | 'manga', username, 'Modification des tags');

    return { message: 'Tag added successfully' };
  }

  async searchTags(query: string, limit = 10, categorie?: string) {
    const q = `%${query}%`;
    let sql = `SELECT id_tag as id, tag_name as name, categorie FROM ak_tags WHERE tag_name ILIKE $1`;
    const params: any[] = [q, limit];
    if (categorie) {
      sql += ` AND categorie ILIKE $3`;
      params.push(categorie);
    }
    sql += ` ORDER BY tag_name LIMIT $2`;
    const rows = await this.prisma.$queryRawUnsafe(sql, ...params);
    return { items: rows };
  }

  async searchAnimeByName(query: string, limit = 10) {
    const q = `%${query}%`;
    const rows = await this.prisma.$queryRaw`
      SELECT
        id_anime as id,
        id_anime as "idAnime",
        titre,
        titre_orig as "originalName",
        statut
      FROM ak_animes
      WHERE titre ILIKE ${q} OR titre_orig ILIKE ${q}
      ORDER BY titre
      LIMIT ${limit}
    `;
    return { items: rows };
  }

  async searchMangaByName(query: string, limit = 10) {
    const q = `%${query}%`;
    const rows = await this.prisma.$queryRaw`
      SELECT
        id_manga as id,
        id_manga as "idManga",
        titre,
        titre_orig as "originalName",
        statut
      FROM ak_mangas
      WHERE titre ILIKE ${q} OR titre_orig ILIKE ${q}
      ORDER BY titre
      LIMIT ${limit}
    `;
    return { items: rows };
  }

  async removeContentTag(id: number, type: string, tagId: number, username: string) {
    await this.prisma.$queryRaw`
      DELETE FROM ak_tag2fiche
      WHERE id_fiche = ${id} AND type = ${type} AND id_tag = ${tagId}
    `;

    // Log the action
    await this.adminLogging.addLog(id, type as 'anime' | 'manga', username, 'Modification des tags');

    return { message: 'Tag removed successfully' };
  }

  async getContentStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM ak_animes WHERE statut = 1) as active_animes,
        (SELECT COUNT(*) FROM ak_animes WHERE statut = 0) as inactive_animes,
        (SELECT COUNT(*) FROM ak_mangas WHERE statut = 1) as active_mangas,
        (SELECT COUNT(*) FROM ak_mangas WHERE statut = 0) as inactive_mangas,
        (SELECT COUNT(*) FROM ak_business WHERE statut = 1) as active_business,
        (SELECT COUNT(*) FROM ak_webzine_articles WHERE statut = 1) as active_articles,
        (SELECT COUNT(*) FROM ak_critique WHERE statut = 0) as pending_reviews,
        (SELECT COUNT(*) FROM ak_synopsis WHERE validation = 0) as pending_synopses
    `;

    const result = (stats as any[])[0];

    // Convert BigInt values to regular numbers for JSON serialization
    return {
      active_animes: Number(result.active_animes),
      inactive_animes: Number(result.inactive_animes),
      active_mangas: Number(result.active_mangas),
      inactive_mangas: Number(result.inactive_mangas),
      active_business: Number(result.active_business),
      active_articles: Number(result.active_articles),
      pending_reviews: Number(result.pending_reviews),
      pending_synopses: Number(result.pending_synopses),
    };
  }

  async getStaffRoleTypes(type: string, query?: string) {
    let table: string;

    if (type === 'anime') {
      table = 'ak_business_to_animes';
    } else if (type === 'manga') {
      table = 'ak_business_to_mangas';
    } else {
      throw new BadRequestException('Invalid content type. Must be anime or manga.');
    }

    let sql: string;
    const params: any[] = [];

    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      sql = `SELECT type FROM ${table} WHERE type ILIKE $1 GROUP BY type ORDER BY type ASC`;
      params.push(q);
    } else {
      sql = `SELECT type FROM ${table} WHERE type IS NOT NULL AND type != '' GROUP BY type ORDER BY type ASC`;
    }

    const rows = await this.prisma.$queryRawUnsafe(sql, ...params);
    return { items: rows };
  }
}
