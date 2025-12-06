import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { JeuVideoQueryDto } from './dto/jeu-video-query.dto';

@Injectable()
export class JeuxVideoService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  async findAll(query: JeuVideoQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      plateforme,
      editeur,
      annee,
      year,
      genre,
      sortBy = 'dateAjout',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;
    const where: any = { statut: 1 }; // Only show published games

    // Search filter
    if (search) {
      where.titre = { contains: search, mode: 'insensitive' };
    }

    // Platform filter
    if (plateforme) {
      where.platforms = {
        some: {
          platform: {
            name: { equals: plateforme, mode: 'insensitive' }
          }
        }
      };
    }

    // Publisher filter
    if (editeur) {
      where.editeur = { contains: editeur, mode: 'insensitive' };
    }

    // Year filter - accept both annee and year parameters (year is an alias)
    if (annee || year) {
      where.annee = annee || year;
    }

    // Genre filter
    if (genre && genre.length > 0) {
      where.genres = {
        some: {
          genre: {
            OR: genre.map(g => ({
              name: { equals: g, mode: 'insensitive' }
            }))
          }
        }
      };
    }

    // Sorting
    const orderBy: any = {};
    if (sortBy === 'titre') {
      orderBy.titre = sortOrder;
    } else if (sortBy === 'annee') {
      orderBy.annee = sortOrder;
    } else if (sortBy === 'moyenneNotes') {
      orderBy.moyenneNotes = sortOrder;
    } else {
      orderBy.dateAjout = sortOrder;
    }

    const [items, total] = await Promise.all([
      this.prisma.akJeuxVideo.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          idJeu: true,
          titre: true,
          niceUrl: true,
          plateforme: true,
          genre: true,
          editeur: true,
          annee: true,
          image: true,
          moyenneNotes: true,
          nbReviews: true,
          dateAjout: true,
          dateSortieJapon: true,
          dateSortieUsa: true,
          dateSortieEurope: true,
          dateSortieWorldwide: true,
          platforms: {
            select: {
              platform: {
                select: {
                  name: true,
                  shortName: true,
                  manufacturer: true,
                }
              }
            }
          },
          genres: {
            select: {
              genre: {
                select: {
                  name: true,
                  nameFr: true,
                  slug: true,
                }
              }
            }
          }
        },
      }),
      this.prisma.akJeuxVideo.count({ where }),
    ]);

    // Map idJeu to id for frontend consistency
    const mappedItems = items.map(item => ({
      ...item,
      id: item.idJeu,
    }));

    return {
      jeuxVideo: mappedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const item = await this.prisma.akJeuxVideo.findUnique({
      where: { idJeu: id, statut: 1 }, // Only show published games
      select: {
        idJeu: true,
        titre: true,
        niceUrl: true,
        plateforme: true,
        genre: true,
        editeur: true,
        annee: true,
        dateSortieJapon: true,
        dateSortieUsa: true,
        dateSortieEurope: true,
        dateSortieWorldwide: true,
        presentation: true,
        image: true,
        moyenneNotes: true,
        nbReviews: true,
        dateAjout: true,
        platforms: {
          select: {
            releaseDate: true,
            isPrimary: true,
            platform: {
              select: {
                idPlatform: true,
                name: true,
                shortName: true,
                manufacturer: true,
                platformType: true,
              }
            }
          },
          orderBy: { isPrimary: 'desc' }
        },
        genres: {
          select: {
            genre: {
              select: {
                idGenre: true,
                name: true,
                nameFr: true,
                slug: true,
              }
            }
          }
        },
        trailers: {
          where: { statut: 1 }, // Only include visible trailers
          select: {
            idTrailer: true,
            titre: true,
            url: true,
            platform: true,
            langue: true,
            typeTrailer: true,
            ordre: true,
          },
          orderBy: { ordre: 'asc' }
        },
        screenshots: {
          select: {
            id: true,
            filename: true,
            caption: true,
            sortorder: true,
          },
          orderBy: { sortorder: 'asc' }
        }
      },
    });

    if (!item) {
      throw new NotFoundException('Jeu vidéo introuvable');
    }

    // Map idJeu to id and presentation to description for frontend consistency
    return {
      ...item,
      id: item.idJeu,
      description: item.presentation,
    };
  }

  async getSimilarGames(id: number, limit: number = 6) {
    // First check if game exists
    const game = await this.prisma.akJeuxVideo.findUnique({
      where: { idJeu: id, statut: 1 },
      select: {
        idJeu: true,
        titre: true,
        developpeur: true,
        editeur: true,
        annee: true,
      },
    });

    if (!game) {
      throw new NotFoundException('Jeu vidéo introuvable');
    }

    // Optimized query using UNION strategy for better performance
    // Prioritize shared content (genres), then developer/publisher, then year
    const similarGames = await this.prisma.$queryRaw`
      WITH results AS (
        -- Priority 1: Shared genres (highest relevance - same themes/genres)
        (SELECT
          j.id_jeu as "idJeu",
          j.titre,
          j.image,
          j.annee,
          j.editeur,
          j.developpeur,
          j.moyennenotes as "moyenneNotes",
          j.nb_reviews as "nbReviews",
          j.nice_url as "niceUrl",
          5 as similarity_score
        FROM ak_jeux_video j
        INNER JOIN ak_jeux_video_genres jg ON jg.id_jeu = j.id_jeu
        WHERE jg.id_genre IN (
          SELECT jg2.id_genre
          FROM ak_jeux_video_genres jg2
          WHERE jg2.id_jeu = ${id}
          LIMIT 10
        )
        AND j.id_jeu != ${id}
        AND j.statut = 1
        ORDER BY j.moyennenotes DESC NULLS LAST
        LIMIT ${limit * 2})

        UNION ALL

        -- Priority 2: Same developer
        (SELECT
          j.id_jeu as "idJeu",
          j.titre,
          j.image,
          j.annee,
          j.editeur,
          j.developpeur,
          j.moyennenotes as "moyenneNotes",
          j.nb_reviews as "nbReviews",
          j.nice_url as "niceUrl",
          4 as similarity_score
        FROM ak_jeux_video j
        WHERE j.developpeur = ${game.developpeur}
          AND j.id_jeu != ${id}
          AND j.statut = 1
          AND j.developpeur IS NOT NULL
          AND j.developpeur != ''
        ORDER BY j.moyennenotes DESC NULLS LAST
        LIMIT ${limit * 2})

        UNION ALL

        -- Priority 3: Same publisher
        (SELECT
          j.id_jeu as "idJeu",
          j.titre,
          j.image,
          j.annee,
          j.editeur,
          j.developpeur,
          j.moyennenotes as "moyenneNotes",
          j.nb_reviews as "nbReviews",
          j.nice_url as "niceUrl",
          3 as similarity_score
        FROM ak_jeux_video j
        WHERE j.editeur = ${game.editeur}
          AND j.id_jeu != ${id}
          AND j.statut = 1
          AND j.editeur IS NOT NULL
          AND j.editeur != ''
        ORDER BY j.moyennenotes DESC NULLS LAST
        LIMIT ${limit * 2})

        UNION ALL

        -- Priority 4: Similar year (within 2 years)
        (SELECT
          j.id_jeu as "idJeu",
          j.titre,
          j.image,
          j.annee,
          j.editeur,
          j.developpeur,
          j.moyennenotes as "moyenneNotes",
          j.nb_reviews as "nbReviews",
          j.nice_url as "niceUrl",
          2 as similarity_score
        FROM ak_jeux_video j
        WHERE ABS(j.annee - ${game.annee || 0}) <= 2
          AND j.id_jeu != ${id}
          AND j.statut = 1
        ORDER BY j.moyennenotes DESC NULLS LAST
        LIMIT ${limit * 2})
      )
      SELECT DISTINCT ON ("idJeu")
        "idJeu",
        titre,
        image,
        annee,
        editeur,
        developpeur,
        "moyenneNotes",
        "nbReviews",
        "niceUrl",
        MAX(similarity_score) as similarity_score
      FROM results
      GROUP BY "idJeu", titre, image, annee, editeur, developpeur, "moyenneNotes", "nbReviews", "niceUrl"
      ORDER BY "idJeu", similarity_score DESC, "moyenneNotes" DESC NULLS LAST
      LIMIT ${limit}
    ` as any[];

    return {
      game_id: id,
      similar: similarGames.map((g: any) => ({
        id: g.idJeu,
        idJeu: g.idJeu,
        titre: g.titre,
        image: g.image,
        annee: g.annee,
        editeur: g.editeur,
        developpeur: g.developpeur,
        moyenneNotes: g.moyenneNotes,
        nbReviews: g.nbReviews,
        niceUrl: g.niceUrl,
      })),
    };
  }

  async getPlatforms() {
    // Try to get from cache
    const cacheKey = 'jeux_video:platforms';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const platforms = await this.prisma.akPlatform.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        idPlatform: true,
        name: true,
        shortName: true,
        manufacturer: true,
        generation: true,
        releaseYear: true,
        platformType: true,
        sortOrder: true,
      }
    });

    const result = { platforms };

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.set(cacheKey, result, 3600);

    return result;
  }

  async autocomplete(query: string, exclude?: string, limit = 10) {
    if (!query || query.length < 2) {
      return { data: [] };
    }

    const where: any = {
      titre: { contains: query, mode: 'insensitive' },
      statut: 1,
    };

    if (exclude) {
      const excludeIds = exclude
        .split(',')
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));

      if (excludeIds.length > 0) {
        where.idJeu = { notIn: excludeIds };
      }
    }

    // Fetch more items than needed to allow for better ranking
    const results = await this.prisma.akJeuxVideo.findMany({
      where,
      take: limit * 3, // Fetch 3x to have more candidates for ranking
      orderBy: { titre: 'asc' },
      select: {
        idJeu: true,
        titre: true,
        niceUrl: true,
        image: true,
        annee: true,
        moyenneNotes: true,
      },
    });

    // Rank results by match quality
    const queryLower = query.toLowerCase();
    const rankedResults = results
      .map((item) => {
        const titreLower = (item.titre || '').toLowerCase();
        let rank = 3; // Default: contains

        if (titreLower === queryLower) {
          rank = 1; // Exact match
        } else if (titreLower.startsWith(queryLower)) {
          rank = 2; // Starts with
        }

        return { ...item, _rank: rank };
      })
      .sort((a, b) => {
        // Sort by rank first, then alphabetically
        if (a._rank !== b._rank) {
          return a._rank - b._rank;
        }
        return (a.titre || '').localeCompare(b.titre || '');
      })
      .slice(0, limit) // Take only the requested limit
      .map(({ _rank, ...item }) => item); // Remove the rank field

    // Map idJeu to id for frontend consistency
    const mappedResults = rankedResults.map(item => ({
      ...item,
      id: item.idJeu,
    }));

    return { data: mappedResults };
  }

  async getRelationships(id: number) {
    const sourceKey = `jeu${id}`;

    const sql = `
      WITH base_relations AS (
        -- When id_fiche_depart matches our game, the relation is in id_anime/id_manga/id_jeu columns
        SELECT
          r.id_relation,
          r.id_fiche_depart,
          r.id_anime,
          r.id_manga,
          r.id_jeu,
          CASE
            WHEN r.id_anime > 0 THEN 'anime'
            WHEN r.id_manga > 0 THEN 'manga'
            WHEN r.id_jeu > 0 THEN 'jeu-video'
          END as related_type,
          CASE
            WHEN r.id_anime > 0 THEN r.id_anime
            WHEN r.id_manga > 0 THEN r.id_manga
            WHEN r.id_jeu > 0 THEN r.id_jeu
          END as related_id
        FROM ak_fiche_to_fiche r
        WHERE r.id_fiche_depart = $1

        UNION ALL

        -- When id_jeu matches our game, the relation is in id_fiche_depart column
        SELECT
          r.id_relation,
          r.id_fiche_depart,
          r.id_anime,
          r.id_manga,
          r.id_jeu,
          CASE
            WHEN r.id_fiche_depart ~ '^anime[0-9]+' THEN 'anime'
            WHEN r.id_fiche_depart ~ '^manga[0-9]+' THEN 'manga'
            WHEN r.id_fiche_depart ~ '^jeu[0-9]+' THEN 'jeu-video'
          END as related_type,
          CASE
            WHEN r.id_fiche_depart ~ '^anime[0-9]+' THEN CAST(SUBSTRING(r.id_fiche_depart, 6) AS INTEGER)
            WHEN r.id_fiche_depart ~ '^manga[0-9]+' THEN CAST(SUBSTRING(r.id_fiche_depart, 6) AS INTEGER)
            WHEN r.id_fiche_depart ~ '^jeu[0-9]+' THEN CAST(SUBSTRING(r.id_fiche_depart, 4) AS INTEGER)
          END as related_id
        FROM ak_fiche_to_fiche r
        WHERE r.id_jeu = $2 AND r.id_fiche_depart != $1
      )
      SELECT
        br.id_relation,
        br.related_type,
        br.related_id,
        COALESCE(a.titre, m.titre, j.titre) as related_title,
        COALESCE(a.nice_url, m.nice_url, j.nice_url) as related_nice_url,
        COALESCE(a.image, m.image, j.image) as related_image
      FROM base_relations br
      LEFT JOIN ak_animes a ON br.related_type = 'anime' AND br.related_id = a.id_anime AND a.statut = 1
      LEFT JOIN ak_mangas m ON br.related_type = 'manga' AND br.related_id = m.id_manga AND m.statut = 1
      LEFT JOIN ak_jeux_video j ON br.related_type = 'jeu-video' AND br.related_id = j.id_jeu AND j.statut = 1
      WHERE (a.id_anime IS NOT NULL OR m.id_manga IS NOT NULL OR j.id_jeu IS NOT NULL)
    `;

    const rows = await this.prisma.$queryRawUnsafe(sql, sourceKey, id);
    return rows;
  }
}
