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

@Injectable()
export class AdminContentService {
  constructor(private prisma: PrismaService) {}

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
    console.log(`Admin ${adminId} updated ${type} ${id} status to ${status}`);

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

      // Delete relationships
      const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM ak_fiche_to_fiche WHERE ${idColumn} = $1`,
        id,
      );

      // Delete business relationships
      const staffTable =
        type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
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
    console.log(`Admin ${adminId} deleted ${type} ${id}`);

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
    const relationships = await this.prisma.$queryRaw`
      SELECT 
        r.*,
        CASE 
          WHEN r.id_anime IS NOT NULL THEN a.titre
          WHEN r.id_manga IS NOT NULL THEN m.titre
        END as related_title
      FROM ak_fiche_to_fiche r
      LEFT JOIN ak_animes a ON r.id_anime = a.id_anime
      LEFT JOIN ak_mangas m ON r.id_manga = m.id_manga
      WHERE (r.id_anime = ${id} AND ${type === 'anime'}) OR (r.id_manga = ${id} AND ${type === 'manga'})
    `;

    return relationships;
  }

  async createContentRelationship(
    id: number,
    type: string,
    relationshipDto: CreateContentRelationshipDto,
  ) {
    const { related_id, related_type, relation_type, description } =
      relationshipDto;

    // Check if content exists
    await this.getContentById(id, type);
    await this.getContentById(related_id, related_type);

    // Create relationship
    const animeId =
      type === 'anime' ? id : related_type === 'anime' ? related_id : null;
    const mangaId =
      type === 'manga' ? id : related_type === 'manga' ? related_id : null;
    const relatedAnimeId = related_type === 'anime' ? related_id : null;
    const relatedMangaId = related_type === 'manga' ? related_id : null;

    await this.prisma.$queryRaw`
      INSERT INTO ak_fiche_to_fiche (
        anime_id, 
        manga_id, 
        related_anime_id, 
        related_manga_id, 
        relation_type, 
        description
      ) VALUES (
        ${animeId},
        ${mangaId},
        ${relatedAnimeId},
        ${relatedMangaId},
        ${relation_type},
        ${description || null}
      )
    `;

    return { message: 'Relationship created successfully' };
  }

  async deleteContentRelationship(relationshipId: number) {
    await this.prisma.$queryRaw`
      DELETE FROM ak_fiche_to_fiche WHERE id = ${relationshipId}
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
        b.type,
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
  ) {
    const staffTable =
      type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
    const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';

    // Prevent duplicates
    const existing = await this.prisma.$queryRawUnsafe(
      `SELECT 1 FROM ${staffTable} WHERE ${idColumn} = $1 AND id_business = $2 LIMIT 1`,
      id,
      businessId,
    );
    if ((existing as any[]).length > 0) {
      return { message: 'Staff member already attached' };
    }

    await this.prisma.$queryRawUnsafe(
      `
      INSERT INTO ${staffTable} (${idColumn}, id_business, type)
      VALUES ($1, $2, $3)
    `,
      id,
      businessId,
      role || null,
    );

    return { message: 'Staff member added successfully' };
  }

  async removeContentStaff(id: number, type: string, businessId: number) {
    const staffTable =
      type === 'anime' ? 'ak_business_to_animes' : 'ak_business_to_mangas';
    const idColumn = type === 'anime' ? 'id_anime' : 'id_manga';

    await this.prisma.$queryRawUnsafe(
      `
      DELETE FROM ${staffTable} 
      WHERE ${idColumn} = $1 AND id_business = $2
    `,
      id,
      businessId,
    );

    return { message: 'Staff member removed successfully' };
  }

  async getContentTags(id: number, type: string) {
    const tags = await this.prisma.$queryRaw`
      SELECT 
        t.id_tag as id,
        t.tag_name as nom,
        t.description,
        tf.id
      FROM ak_tag2fiche tf
      JOIN ak_tags t ON tf.id_tag = t.id_tag
      WHERE tf.id_fiche = ${id} AND tf.type = ${type}
    `;

    return tags;
  }

  async addContentTag(id: number, type: string, tagId: number) {
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


  async removeContentTag(id: number, type: string, tagId: number) {
    await this.prisma.$queryRaw`
      DELETE FROM ak_tag2fiche 
      WHERE id_fiche = ${id} AND type = ${type} AND id_tag = ${tagId}
    `;

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
