import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export abstract class BaseContentService<T, CreateDto, UpdateDto, QueryDto> {
  constructor(protected readonly prisma: PrismaService) {}

  protected abstract get model(): any;
  protected abstract get idField(): string;
  protected abstract get tableName(): string;
  protected abstract formatItem(item: any): any;

  async getGenres(statusFilter = 1) {
    const result = await this.model.findMany({
      where: {
        statut: statusFilter,
        genre: { not: null },
      },
      select: { genre: true },
      distinct: ['genre'],
    });

    // Extract and flatten all genres
    const allGenres = new Set<string>();
    result.forEach((item) => {
      if (item.genre) {
        item.genre.split(',').forEach((genre) => {
          allGenres.add(genre.trim());
        });
      }
    });

    return {
      genres: Array.from(allGenres).sort(),
      count: allGenres.size,
    };
  }

  async getItemsByGenre(genre: string, limit = 20, statusFilter = 1) {
    // URL decode the genre parameter
    const decodedGenre = decodeURIComponent(genre.replace(/\+/g, ' '));

    const items = await this.model.findMany({
      where: {
        statut: statusFilter,
        genre: { contains: decodedGenre, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { note: 'desc' },
    });

    return {
      genre: decodedGenre,
      [this.tableName]: items.map(this.formatItem.bind(this)),
      count: items.length,
    };
  }

  async getTopItems(limit = 10, minVotes = 5, statusFilter = 1) {
    const items = await this.model.findMany({
      where: {
        statut: statusFilter,
        nbVotes: { gte: minVotes },
      },
      orderBy: [{ note: 'desc' }, { nbVotes: 'desc' }],
      take: limit,
    });

    return {
      [`top${this.tableName.charAt(0).toUpperCase() + this.tableName.slice(1)}`]:
        items.map(this.formatItem.bind(this)),
      generatedAt: new Date().toISOString(),
    };
  }

  async getRandomItem(statusFilter = 1) {
    // Get random item using Prisma for type safety
    const count = await this.model.count({ where: { statut: statusFilter } });

    if (count === 0) {
      throw new NotFoundException(
        `Aucun ${this.tableName.slice(0, -1)} disponible`,
      );
    }

    const randomSkip = Math.floor(Math.random() * count);
    const randomItem = await this.model.findFirst({
      where: { statut: statusFilter },
      skip: randomSkip,
    });

    if (!randomItem) {
      throw new NotFoundException(
        `Aucun ${this.tableName.slice(0, -1)} disponible`,
      );
    }

    return this.findOne(randomItem[this.idField]);
  }

  async autocomplete(
    query: string,
    exclude?: string,
    limit = 10,
    userId?: number,
  ) {
    if (!query || query.length < 2) {
      return { data: [] };
    }

    const searchTerm = `%${query}%`;
    const idCol = this.idField === 'idAnime' ? 'id_anime' :
                  this.idField === 'idManga' ? 'id_manga' : 'id_jeu';
    const table = this.tableName;
    const statusFilter = 1; // Only show published items

    // Build exclude IDs array
    let excludeIds: number[] = [];

    // Add manual excludes
    if (exclude) {
      const manualExcludes = exclude
        .split(',')
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
      excludeIds.push(...manualExcludes);
    }

    // Add user collection excludes
    if (userId) {
      try {
        const collectionTable = this.idField === 'idAnime' ? 'collection_animes' :
                               this.idField === 'idManga' ? 'collection_mangas' : 'collection_jeux_video';
        const collectionField = this.idField === 'idAnime' ? 'id_anime' :
                               this.idField === 'idManga' ? 'id_manga' : 'id_jeu';

        console.log('[Autocomplete] Filtering collection for userId:', userId);
        console.log('[Autocomplete] Collection table:', collectionTable);
        console.log('[Autocomplete] Collection field:', collectionField);

        const userCollection: any[] = await this.prisma.$queryRawUnsafe(`
          SELECT DISTINCT ${collectionField}
          FROM ${collectionTable}
          WHERE id_membre = ${userId}
          AND ${collectionField} IS NOT NULL
        `);

        console.log('[Autocomplete] User collection items found:', userCollection.length);

        const collectionIds = userCollection
          .map(item => item[collectionField])
          .filter(id => id != null);

        console.log('[Autocomplete] Collection IDs to exclude:', collectionIds.slice(0, 10));

        excludeIds.push(...collectionIds);
      } catch (error) {
        // Silently fail if collections query fails
        console.error('[Autocomplete] Error fetching user collection:', error);
      }
    }

    // Build exclude clause
    let excludeClause = '';
    if (excludeIds.length > 0) {
      excludeClause = `AND ${idCol} NOT IN (${excludeIds.join(',')})`;
    }

    // Use raw SQL with unaccent for accent-insensitive search
    const items: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT *
      FROM ${table}
      WHERE statut = ${statusFilter}
      AND (unaccent(titre) ILIKE unaccent($1)
           OR unaccent(COALESCE(titre_orig, '')) ILIKE unaccent($1))
      ${excludeClause}
      ORDER BY titre ASC
      LIMIT ${limit * 3}
    `, searchTerm);

    // Rank results by match quality (using unaccented comparison)
    const queryLower = query.toLowerCase();
    const rankedItems = items
      .map((item: any) => {
        const titreLower = item.titre?.toLowerCase() || '';
        const titreOrigLower = item.titre_orig?.toLowerCase() || '';
        let rank = 4;

        if (titreLower === queryLower) {
          rank = 1;
        } else if (titreLower.startsWith(queryLower)) {
          rank = 2;
        } else if (titreLower.includes(queryLower)) {
          rank = 3;
        } else if (titreOrigLower === queryLower) {
          rank = 2;
        } else if (titreOrigLower.startsWith(queryLower)) {
          rank = 3;
        }

        // Map snake_case DB columns to camelCase for formatAutocompleteItem
        return {
          ...this.mapRawToModel(item),
          _rank: rank,
        };
      })
      .sort((a, b) => {
        if (a._rank !== b._rank) {
          return a._rank - b._rank;
        }
        return (a.titre || '').localeCompare(b.titre || '');
      })
      .slice(0, limit)
      .map(({ _rank, ...item }) => item);

    return {
      data: rankedItems.map(this.formatAutocompleteItem.bind(this)),
    };
  }

  /**
   * Map raw SQL snake_case row to camelCase model fields.
   * Subclasses can override for custom mappings.
   */
  protected mapRawToModel(row: any): any {
    return row;
  }

  async getTags(id: number, type: string, statusFilter = 1) {
    // First check if item exists
    const item = await this.model.findUnique({
      where: { [this.idField]: id, statut: statusFilter },
      select: { [this.idField]: true },
    });

    if (!item) {
      throw new NotFoundException(
        `${this.tableName.charAt(0).toUpperCase() + this.tableName.slice(1, -1)} introuvable`,
      );
    }

    // For now, return empty tags since the tag tables don't exist in the current schema
    // TODO: Implement proper tag system when tag tables are created
    try {
      // Try to get tags using raw SQL (this will fail if tables don't exist)
      const tags = await this.prisma.$queryRaw`
        SELECT
          t.id_tag,
          t.tag_name,
          t.tag_nice_url,
          t.description,
          t.categorie
        FROM ak_tags t
        INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
        WHERE tf.id_fiche = ${id} AND tf.type = ${type}
        ORDER BY t.categorie, t.tag_name
      `;

      return {
        [`${type}_id`]: id,
        tags,
      };
    } catch (error) {
      // If tag tables don't exist, return empty tags instead of throwing error
      console.warn(`Tag tables not found, returning empty tags for ${type} ${id}`);
      return {
        [`${type}_id`]: id,
        tags: [],
      };
    }
  }

  protected abstract getAutocompleteSelectFields(): any;
  protected abstract formatAutocompleteItem(item: any): any;
  protected abstract findOne(
    id: number,
    includeReviews?: boolean,
  ): Promise<any>;
}
