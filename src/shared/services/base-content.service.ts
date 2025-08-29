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
    const items = await this.model.findMany({
      where: {
        statut: statusFilter,
        genre: { contains: genre, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { note: 'desc' },
    });

    return {
      genre,
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
    statusFilter = 1,
  ) {
    if (!query || query.length < 2) {
      return { data: [] };
    }

    const where: any = {
      titre: { contains: query, mode: 'insensitive' },
      statut: statusFilter,
    };

    if (exclude) {
      const excludeIds = exclude
        .split(',')
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));

      if (excludeIds.length > 0) {
        where[this.idField] = { notIn: excludeIds };
      }
    }

    const selectFields = this.getAutocompleteSelectFields();

    const items = await this.model.findMany({
      where,
      select: selectFields,
      orderBy: { titre: 'asc' },
      take: limit,
    });

    return {
      data: items.map(this.formatAutocompleteItem.bind(this)),
    };
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

    // Get tags using raw SQL for now (until we have proper relations)
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
  }

  protected abstract getAutocompleteSelectFields(): any;
  protected abstract formatAutocompleteItem(item: any): any;
  protected abstract findOne(
    id: number,
    includeReviews?: boolean,
  ): Promise<any>;
}
