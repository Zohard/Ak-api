import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { JeuVideoQueryDto } from './dto/jeu-video-query.dto';

@Injectable()
export class JeuxVideoService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) { }

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

    // Create a simplified cache key for games
    const cacheKey = `games_list:${JSON.stringify(query)}`;

    // Try to get from cache first
    // Note: We're reusing getAnimeList because it's a generic "get list" utility in CacheService
    // even though the method name implies anime. The underlying redis key prefixes are handled by setAnimeList/getAnimeList.
    // Wait, better to use the specific method if it exists, or raw get/set if not.
    // CacheService DOES NOT have getGameList/setGameList.
    // Let's us specific keys with generic get/set or add methods to CacheService?
    // User asked for "Recent Media" cache.
    // Ideally I should add getGameList/setGameList to CacheService but for now I will use generic set/get with a specific key.

    // Actually, looking at CacheService again, it has:
    // getAnimeList -> `anime_list:${key}`
    // getMangaList -> `manga_list:${key}`
    // Let's assume we should adding getGameList/setGameList is the "right" way but user wants quick fix. 
    // I will use direct cacheService.get/set with a prefixed key.

    const ttl = search || genre ? 180 : 1200; // 3 mins for search, 20 mins for general lists
    const cached = await this.cacheService.get(`game_list:${cacheKey}`);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * limit;
    const where: any = { statut: 1 }; // Only show published games

    const searchIds: number[] = [];
    let searchActive = false;

    // Search filter
    if (search) {
      searchActive = true;
      const searchTerm = `%${search}%`;
      try {
        const matchingIds = await this.prisma.$queryRaw<Array<{ id_jeu: number }>>`
          SELECT id_jeu FROM ak_jeux_video
          WHERE unaccent(titre) ILIKE unaccent(${searchTerm})
        `;
        searchIds.push(...matchingIds.map(r => r.id_jeu));
      } catch (error) {
        // Fallback if unaccent extension is missing
        console.warn('Search with unaccent failed, falling back to standard ILIKE:', error);
        const matchingIds = await this.prisma.akJeuxVideo.findMany({
          where: {
            titre: { contains: search, mode: 'insensitive' }
          },
          select: { idJeu: true }
        });
        searchIds.push(...matchingIds.map(item => item.idJeu));
      }
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

    // Intersect fallback: if search is active, intersect with whatever is already in where.idJeu
    if (searchActive) {
      if (where.idJeu?.in) {
        where.idJeu.in = where.idJeu.in.filter(id => searchIds.includes(id));
      } else {
        where.idJeu = { in: searchIds };
      }
    }

    // REMOVED: No need to filter out null values since columns are NOT NULL
    // dateAjout is TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    // annee is INTEGER NOT NULL DEFAULT 0

    // Sorting with secondary sort by idJeuVideo for stable pagination
    const orderBy: any = [];
    if (sortBy === 'titre') {
      orderBy.push({ titre: sortOrder }, { idJeu: 'asc' as const });
    } else if (sortBy === 'annee') {
      orderBy.push({ annee: sortOrder }, { idJeu: 'asc' as const });
    } else if (sortBy === 'moyenneNotes') {
      orderBy.push({ moyenneNotes: sortOrder }, { idJeu: 'asc' as const });
    } else {
      orderBy.push({ dateAjout: sortOrder }, { idJeu: 'asc' as const });
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

    const result = {
      jeuxVideo: mappedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result
    // reuse ttl logic (it might not be in scope depending on where I put it previously)
    // Cache the result
    await this.cacheService.set(`game_list:${cacheKey}`, result, ttl);

    return result;
  }

  async getPlanning(year: number, month: number) {
    // Cache key
    const cacheKey = `planning_games:${year}_${month}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate generic start/end dates for the month
    // Note: JS months are 0-indexed in Date constructor, but we expect 1-12 input
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of current month

    const items = await this.prisma.akJeuxVideo.findMany({
      where: {
        statut: 1, // Published
        OR: [
          { dateSortieWorldwide: { gte: startDate, lte: endDate } },
          { dateSortieJapon: { gte: startDate, lte: endDate } },
          { dateSortieUsa: { gte: startDate, lte: endDate } },
          { dateSortieEurope: { gte: startDate, lte: endDate } },
        ]
      },
      select: {
        idJeu: true,
        titre: true,
        niceUrl: true,
        plateforme: true, // Legacy
        image: true,
        moyenneNotes: true,
        dateSortieWorldwide: true,
        dateSortieJapon: true,
        dateSortieUsa: true,
        dateSortieEurope: true,
        platforms: {
          select: {
            platform: {
              select: {
                name: true,
                shortName: true,
              }
            }
          }
        }
      },
    });

    // Sort by earliest release date in the target month
    const sortedItems = items.sort((a, b) => {
      const getEarliestDateInMonth = (item: typeof items[0]) => {
        const dates = [
          item.dateSortieWorldwide,
          item.dateSortieJapon,
          item.dateSortieUsa,
          item.dateSortieEurope,
        ]
          .filter(d => d !== null)
          .map(d => new Date(d!))
          .filter(d => d.getMonth() + 1 === month && d.getFullYear() === year);

        return dates.length > 0 ? Math.min(...dates.map(d => d.getTime())) : Infinity;
      };

      return getEarliestDateInMonth(a) - getEarliestDateInMonth(b);
    });

    // Map for frontend
    const mappedItems = sortedItems.map(item => ({
      ...item,
      id: item.idJeu,
    }));

    // Cache for 1 hour
    await this.cacheService.set(cacheKey, mappedItems, 3600);

    return mappedItems;
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

    // Fallback: If no platforms in junction table, parse legacy plateforme field
    let platforms = item.platforms || [];
    if (platforms.length === 0 && item.plateforme) {
      // Parse comma-separated legacy platform field
      const legacyPlatforms = item.plateforme
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);

      // Create virtual platform objects from legacy data
      platforms = legacyPlatforms.map((platformName, index) => ({
        releaseDate: null,
        isPrimary: index === 0, // First one is primary
        platform: {
          idPlatform: null,
          name: platformName,
          shortName: platformName,
          manufacturer: null,
          platformType: null,
        }
      }));
    }

    // Increment view count
    await this.incrementViewCount(id);

    // Map idJeu to id and presentation to description for frontend consistency
    return {
      ...item,
      platforms, // Use fallback platforms if needed
      id: item.idJeu,
      description: item.presentation,
    };
  }

  private async incrementViewCount(id: number): Promise<void> {
    try {
      await this.prisma.akJeuxVideo.update({
        where: { idJeu: id },
        data: {
          nbClics: {
            increment: 1
          }
        }
      });
    } catch (error) {
      // Log error but don't fail the request
      console.error(`Failed to increment view count for game ${id}:`, error);
    }
  }

  async getGenres(id: number) {
    const game = await this.prisma.akJeuxVideo.findUnique({
      where: { idJeu: id, statut: 1 },
      select: {
        genres: {
          select: {
            genre: {
              select: {
                name: true,
              }
            }
          }
        }
      }
    });

    if (!game) {
      throw new NotFoundException('Jeu vidéo introuvable');
    }

    // Return genre names as an array of strings (similar to anime/manga tags)
    return {
      tags: game.genres.map(g => g.genre.name)
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

    // Check if game has genres
    const hasGenres = await this.prisma.akJeuxVideoGenre.count({
      where: { idJeu: id }
    });

    const hasEditeur = game.editeur && game.editeur !== '';
    const useTitleFallback = hasGenres === 0 && !hasEditeur;

    if (useTitleFallback) {
      // Log removed
    }

    // Optimized query using UNION strategy for better performance
    // Prioritize shared content (genres), then developer/publisher, then year
    // If no genres/editeur, fallback to title similarity
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

        UNION ALL

        -- Priority 5: Title similarity (fallback when no genres/editeur)
        -- Only used if game has no genres and no editeur
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
          CASE
            WHEN ${useTitleFallback} THEN 6
            ELSE 1
          END as similarity_score
        FROM ak_jeux_video j
        WHERE j.id_jeu != ${id}
          AND j.statut = 1
          AND (
            -- Use title similarity when game lacks genres and editeur
            ${useTitleFallback} = true
            AND (
              -- Match similar title words (first word of title)
              LOWER(j.titre) LIKE '%' || LOWER(SUBSTRING(${game.titre} FROM 1 FOR
                CASE WHEN POSITION(' ' IN ${game.titre}) > 0
                THEN POSITION(' ' IN ${game.titre}) - 1
                ELSE LENGTH(${game.titre})
                END
              )) || '%'
              OR LOWER(${game.titre}) LIKE '%' || LOWER(SUBSTRING(j.titre FROM 1 FOR
                CASE WHEN POSITION(' ' IN j.titre) > 0
                THEN POSITION(' ' IN j.titre) - 1
                ELSE LENGTH(j.titre)
                END
              )) || '%'
            )
          )
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

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.set(cacheKey, platforms, 3600);

    return platforms;
  }

  async autocomplete(query: string, exclude?: string, limit = 10) {
    if (!query || query.length < 2) {
      return { data: [] };
    }

    const searchTerm = `%${query}%`;

    // Build exclude clause
    let excludeClause = '';
    if (exclude) {
      const excludeIds = exclude
        .split(',')
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));

      if (excludeIds.length > 0) {
        excludeClause = `AND id_jeu NOT IN (${excludeIds.join(',')})`;
      }
    }

    // Use raw SQL with unaccent for accent-insensitive search
    const results: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT id_jeu, titre, nice_url, image, annee, moyenne_notes
      FROM ak_jeux_video
      WHERE statut = 1
      AND unaccent(titre) ILIKE unaccent($1)
      ${excludeClause}
      ORDER BY titre ASC
      LIMIT ${limit * 3}
    `, searchTerm);

    // Rank results by match quality
    const queryLower = query.toLowerCase();
    const rankedResults = results
      .map((item) => {
        const titreLower = (item.titre || '').toLowerCase();
        let rank = 3;

        if (titreLower === queryLower) {
          rank = 1;
        } else if (titreLower.startsWith(queryLower)) {
          rank = 2;
        }

        return { ...item, _rank: rank };
      })
      .sort((a, b) => {
        if (a._rank !== b._rank) {
          return a._rank - b._rank;
        }
        return (a.titre || '').localeCompare(b.titre || '');
      })
      .slice(0, limit)
      .map(({ _rank, ...item }) => item);

    // Map snake_case to camelCase for frontend consistency
    const mappedResults = rankedResults.map(item => ({
      idJeu: item.id_jeu,
      id: item.id_jeu,
      titre: item.titre,
      niceUrl: item.nice_url,
      image: item.image,
      annee: item.annee,
      moyenneNotes: item.moyenne_notes,
    }));

    return { data: mappedResults };
  }

  async getRelationships(id: number) {
    const cacheKey = `jeu-video_relations:${id}`;
    const cached = await this.cacheService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

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

    // Cache for 12 hours (43200 seconds)
    await this.cacheService.set(cacheKey, rows, 43200);

    return rows;
  }

  async findByIds(ids: number[]) {
    if (!ids || ids.length === 0) {
      return [];
    }

    const items = await this.prisma.akJeuxVideo.findMany({
      where: {
        idJeu: { in: ids },
        statut: 1, // Only return published games
      },
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
    });

    // Map idJeu to id for frontend consistency
    const mappedItems = items.map(item => ({
      ...item,
      id: item.idJeu,
    }));

    // Create a map for quick lookup
    const itemMap = new Map(mappedItems.map(item => [item.idJeu, item]));

    // Return items in the same order as the input IDs
    return ids
      .map(id => itemMap.get(id))
      .filter(Boolean);
  }
}
