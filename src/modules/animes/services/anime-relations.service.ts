import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { RelatedContentItem, RelationsResponse } from '../../shared/types/relations.types';

@Injectable()
export class AnimeRelationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) { }

  async getAnimeRelations(id: number): Promise<RelationsResponse> {
    // Try to get from cache first (15 minutes TTL)
    const cacheKey = `anime_relations:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as RelationsResponse;
    }

    try {


      // First check if anime exists
      const anime = await this.prisma.akAnime.findUnique({
        where: { idAnime: id, statut: 1 },
        select: { idAnime: true },
      });

      if (!anime) {
        throw new NotFoundException('Anime introuvable');
      }


      // Get BIDIRECTIONAL relations: where anime is source OR target
      const relations = await this.prisma.$queryRaw`
        SELECT id_relation, id_fiche_depart, id_anime, id_manga
        FROM ak_fiche_to_fiche
        WHERE id_fiche_depart = ${`anime${id}`} OR id_anime = ${id}
      ` as any[];



      const relatedContent: RelatedContentItem[] = [];

      // Process each relation to get the actual content
      for (const relation of relations) {
        // Case 1: This anime is the SOURCE
        if (relation.id_fiche_depart === `anime${id}`) {
          if (relation.id_anime && relation.id_anime > 0) {
            // Related anime
            const relatedAnime = await this.prisma.akAnime.findUnique({
              where: { idAnime: relation.id_anime, statut: 1 },
              select: {
                idAnime: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                niceUrl: true,
              },
            });

            if (relatedAnime) {
              relatedContent.push({
                id: relatedAnime.idAnime,
                type: 'anime',
                title: relatedAnime.titre,
                image: relatedAnime.image,
                year: relatedAnime.annee,
                rating: relatedAnime.moyenneNotes,
                niceUrl: relatedAnime.niceUrl,
                relationType: 'related',
              });
            }
          } else if (relation.id_manga && relation.id_manga > 0) {
            // Related manga
            const relatedManga = await this.prisma.akManga.findUnique({
              where: { idManga: relation.id_manga, statut: 1 },
              select: {
                idManga: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                niceUrl: true,
              },
            });

            if (relatedManga) {
              relatedContent.push({
                id: relatedManga.idManga,
                type: 'manga',
                title: relatedManga.titre,
                image: relatedManga.image,
                year: relatedManga.annee,
                rating: relatedManga.moyenneNotes,
                niceUrl: relatedManga.niceUrl,
                relationType: 'related',
              });
            }
          }
        }
        // Case 2: This anime is the TARGET
        else if (relation.id_anime === id) {
          const ficheMatch = relation.id_fiche_depart?.match(/^anime(\d+)$/);
          if (ficheMatch) {
            const sourceAnimeId = parseInt(ficheMatch[1]);
            const sourceAnime = await this.prisma.akAnime.findUnique({
              where: { idAnime: sourceAnimeId, statut: 1 },
              select: {
                idAnime: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                niceUrl: true,
              },
            });

            if (sourceAnime) {
              relatedContent.push({
                id: sourceAnime.idAnime,
                type: 'anime',
                title: sourceAnime.titre,
                image: sourceAnime.image,
                year: sourceAnime.annee,
                rating: sourceAnime.moyenneNotes,
                niceUrl: sourceAnime.niceUrl,
                relationType: 'related',
              });
            }
          } else {
            const mangaMatch = relation.id_fiche_depart?.match(/^manga(\d+)$/);
            if (mangaMatch) {
              const sourceMangaId = parseInt(mangaMatch[1]);
              const sourceManga = await this.prisma.akManga.findUnique({
                where: { idManga: sourceMangaId, statut: 1 },
                select: {
                  idManga: true,
                  titre: true,
                  image: true,
                  annee: true,
                  moyenneNotes: true,
                  niceUrl: true,
                },
              });

              if (sourceManga) {
                relatedContent.push({
                  id: sourceManga.idManga,
                  type: 'manga',
                  title: sourceManga.titre,
                  image: sourceManga.image,
                  year: sourceManga.annee,
                  rating: sourceManga.moyenneNotes,
                  niceUrl: sourceManga.niceUrl,
                  relationType: 'related',
                });
              }
            }
          }
        }
      }

      // Get articles linked to this anime
      const articleRelations = await this.prisma.akWebzineToFiches.findMany({
        where: {
          idFiche: id,
          type: 'anime',
        },
        include: {
          wpPost: {
            select: {
              ID: true,
              postTitle: true,
              postExcerpt: true,
              postDate: true,
              postName: true,
              postStatus: true,
              postMeta: {
                where: {
                  metaKey: {
                    in: ['imgunebig', 'imgunebig2', 'ak_img', 'img'],
                  },
                },
                select: {
                  metaKey: true,
                  metaValue: true,
                },
              },
            },
          },
        },
      });

      // Add published articles to related content
      for (const articleRel of articleRelations) {
        if (articleRel.wpPost?.postStatus === 'publish') {
          const imgunebigMeta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'imgunebig');
          const imgunebig2Meta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'imgunebig2');
          const akImgMeta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'ak_img');
          const imgMeta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'img');

          const coverImage = imgunebigMeta?.metaValue ||
            imgunebig2Meta?.metaValue ||
            akImgMeta?.metaValue ||
            imgMeta?.metaValue ||
            null;

          relatedContent.push({
            id: Number(articleRel.wpPost.ID),
            type: 'article',
            title: articleRel.wpPost.postTitle || 'Sans titre',
            image: coverImage,
            year: null,
            rating: null,
            niceUrl: null,
            relationType: 'article',
            slug: articleRel.wpPost.postName || '',
            date: articleRel.wpPost.postDate,
            excerpt: articleRel.wpPost.postExcerpt || '',
          });
        }
      }

      const result = {
        anime_id: id,
        relations: relatedContent,
        total: relatedContent.length,
      };

      // Cache for 15 minutes (900 seconds)
      await this.cacheService.set(cacheKey, result, 900);

      return result;
    } catch (error) {
      console.error('Error in getAnimeRelations:', error);
      throw error;
    }
  }

  async getAnimeArticles(id: number) {
    // Try to get from cache first (10 minutes TTL)
    const cacheKey = `anime_articles:${id}`;
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

    // Get articles linked to this anime
    const articles = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idFiche: id,
        type: 'anime',
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            postTitle: true,
            postContent: true,
            postExcerpt: true,
            postDate: true,
            postName: true,
            postStatus: true,
            postMeta: {
              where: {
                metaKey: {
                  in: ['imgunebig', 'imgunebig2', 'ak_img', 'img'],
                },
              },
              select: {
                metaKey: true,
                metaValue: true,
              },
            },
          },
        },
      },
      orderBy: {
        idRelation: 'desc',
      },
    });

    // Format the response
    const result = articles
      .filter((article) => article.wpPost !== null && article.wpPost.postStatus === 'publish')
      .map((article) => {
        const post = article.wpPost!;

        // Extract cover image from postMeta
        const imgunebigMeta = post.postMeta.find(meta => meta.metaKey === 'imgunebig');
        const imgunebig2Meta = post.postMeta.find(meta => meta.metaKey === 'imgunebig2');
        const akImgMeta = post.postMeta.find(meta => meta.metaKey === 'ak_img');
        const imgMeta = post.postMeta.find(meta => meta.metaKey === 'img');

        const coverImage = imgunebigMeta?.metaValue ||
          imgunebig2Meta?.metaValue ||
          akImgMeta?.metaValue ||
          imgMeta?.metaValue ||
          null;

        return {
          id: post.ID,
          title: post.postTitle,
          excerpt: post.postExcerpt,
          content: post.postContent,
          date: post.postDate,
          slug: post.postName,
          coverImage,
        };
      });

    // Cache for 10 minutes (600 seconds)
    await this.cacheService.set(cacheKey, result, 600);

    return result;
  }

  async getAnimeSeason(id: number): Promise<{ season: string; year: number; id: number } | null> {
    try {
      // Query to find the season where this anime ID is in the json_data
      const seasons = await this.prisma.$queryRaw<Array<{
        id_saison: number;
        saison: number;
        annee: number;
        json_data: string;
      }>>`
        SELECT id_saison, saison, annee, json_data
        FROM ak_animes_saisons
        WHERE json_data::text LIKE ${`%"animes":%${id}%`}
        LIMIT 1
      `;

      if (seasons && seasons.length > 0) {
        const season = seasons[0];
        // Map numeric season to string
        const seasonNames = {
          1: 'Hiver',
          2: 'Printemps',
          3: 'Ete',
          4: 'Automne'
        };

        const seasonName = seasonNames[season.saison] || 'Hiver';

        return {
          id: season.id_saison,
          season: seasonName,
          year: season.annee,
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching anime season:', error);
      return null;
    }
  }

  async getSimilarAnimes(id: number, limit: number = 6) {
    // Try to get from cache first (30 minutes TTL)
    const cacheKey = `similar_animes:${id}:${limit}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id, statut: 1 },
      select: {
        idAnime: true,
        titre: true,
        titreOrig: true,
        studio: true,
        format: true,
        annee: true,
      },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Optimized query using UNION strategy for better performance
    const similarAnimes = await this.prisma.$queryRaw`
        WITH results AS (
            -- Priority 1: Shared tags
            (SELECT
                 a.id_anime as "idAnime",
                 a.titre,
                 a.titre_orig as "titreOrig",
                 a.studio,
                 a.format,
                 a.annee,
                 a.image,
                 a.nb_ep as "nbEp",
                 a.moyennenotes as "moyenneNotes",
                 a.statut,
                 a.nice_url as "niceUrl",
                 5 as similarity_score
             FROM ak_animes a
                      INNER JOIN ak_tag2fiche tf ON tf.id_fiche = a.id_anime AND tf.type = 'anime'
             WHERE tf.id_tag IN (
                 SELECT tf2.id_tag
                 FROM ak_tag2fiche tf2
                 WHERE tf2.id_fiche = ${id} AND tf2.type = 'anime'
                 LIMIT 10
            )
            AND a.id_anime != ${id}
            AND a.statut = 1
        ORDER BY a.moyennenotes DESC NULLS LAST
            LIMIT ${limit * 2})

        UNION ALL

        -- Priority 2: Similar titles
        (SELECT
            a.id_anime as "idAnime",
            a.titre,
            a.titre_orig as "titreOrig",
            a.studio,
            a.format,
            a.annee,
            a.image,
            a.nb_ep as "nbEp",
            a.moyennenotes as "moyenneNotes",
            a.statut,
            a.nice_url as "niceUrl",
            4 as similarity_score
        FROM ak_animes a
        WHERE a.id_anime != ${id}
          AND a.statut = 1
          AND (
            (similarity(a.titre, ${anime.titre}) BETWEEN 0.6 AND 0.9)
           OR
            (a.titre_orig IS NOT NULL
          AND ${anime.titreOrig || ''} != ''
          AND similarity(a.titre_orig, ${anime.titreOrig || ''}) BETWEEN 0.6 AND 0.9)
            )
        ORDER BY
            GREATEST(
            similarity(a.titre, ${anime.titre}),
            COALESCE(similarity(a.titre_orig, ${anime.titreOrig || ''}), 0)
                ) DESC,
            a.moyennenotes DESC NULLS LAST
            LIMIT ${limit})

        UNION ALL

        -- Priority 3: Same format and year
        (SELECT
            a.id_anime as "idAnime",
            a.titre,
            a.titre_orig as "titreOrig",
            a.studio,
            a.format,
            a.annee,
            a.image,
            a.nb_ep as "nbEp",
            a.moyennenotes as "moyenneNotes",
            a.statut,
            a.nice_url as "niceUrl",
            3 as similarity_score
        FROM ak_animes a
        WHERE a.id_anime != ${id}
          AND a.statut = 1
          AND a.format = ${anime.format || ''}
          AND a.annee = ${anime.annee || ''}
        ORDER BY a.moyennenotes DESC NULLS LAST
            LIMIT ${limit})

        UNION ALL

        -- Priority 4: Same studio
        (SELECT
            a.id_anime as "idAnime",
            a.titre,
            a.titre_orig as "titreOrig",
            a.studio,
            a.format,
            a.annee,
            a.image,
            a.nb_ep as "nbEp",
            a.moyennenotes as "moyenneNotes",
            a.statut,
            a.nice_url as "niceUrl",
            2 as similarity_score
        FROM ak_animes a
        WHERE a.id_anime != ${id}
          AND a.statut = 1
          AND a.studio IS NOT NULL
          AND a.studio = ${anime.studio || ''}
          AND a.studio != ''
        ORDER BY a.moyennenotes DESC NULLS LAST
            LIMIT ${limit})
        )
        SELECT DISTINCT ON ("idAnime") *
        FROM results
        ORDER BY "idAnime", similarity_score DESC, "moyenneNotes" DESC NULLS LAST
            LIMIT ${limit}
    ` as any[];

    const result = {
      anime_id: id,
      similar: similarAnimes.map((a: any) => ({
        id: a.idAnime,
        titre: a.titre,
        titreOrig: a.titreOrig,
        studio: a.studio,
        format: a.format,
        annee: a.annee,
        image: a.image,
        nbEp: a.nbEp,
        moyenneNotes: a.moyenneNotes,
        statut: a.statut,
        niceUrl: a.niceUrl,
        similarityScore: Number(a.similarity_score),
      })),
    };

    // Cache for 30 minutes (1800 seconds)
    await this.cacheService.set(cacheKey, result, 1800);

    return result;
  }
}
