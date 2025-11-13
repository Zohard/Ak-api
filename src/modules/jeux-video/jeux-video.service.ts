import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { JeuVideoQueryDto } from './dto/jeu-video-query.dto';

@Injectable()
export class JeuxVideoService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: JeuVideoQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      plateforme,
      editeur,
      annee,
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

    // Year filter
    if (annee) {
      where.annee = annee;
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
                slug: true,
              }
            }
          }
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

  async getPlatforms() {
    const platforms = await this.prisma.akPlatform.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        idPlatform: true,
        name: true,
        manufacturer: true,
        generation: true,
        releaseYear: true,
        platformType: true,
        sortOrder: true,
      }
    });

    return { platforms };
  }

  async getRelationships(id: number) {
    const sourceKey = `jeu${id}`;

    const sql = `
      WITH base_relations AS (
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
            WHEN r.id_fiche_depart ~ '^jeu[0-9]+' THEN 'jeu-video'
          END as related_type,
          CASE
            WHEN r.id_anime > 0 THEN r.id_anime
            WHEN r.id_manga > 0 THEN r.id_manga
            WHEN r.id_jeu > 0 THEN r.id_jeu
            WHEN r.id_fiche_depart ~ '^jeu[0-9]+' THEN CAST(SUBSTRING(r.id_fiche_depart, 4) AS INTEGER)
          END as related_id
        FROM ak_fiche_to_fiche r
        WHERE r.id_fiche_depart = $1 OR r.id_jeu = $2
      )
      SELECT
        br.id_relation,
        br.related_type,
        br.related_id,
        COALESCE(a.titre, m.titre, j.titre, j2.titre) as related_title,
        COALESCE(a.nice_url, m.nice_url, j.nice_url, j2.nice_url) as related_nice_url,
        COALESCE(a.image, m.image, j.image, j2.image) as related_image
      FROM base_relations br
      LEFT JOIN ak_animes a ON br.id_anime > 0 AND br.id_anime = a.id_anime AND a.statut = 1
      LEFT JOIN ak_mangas m ON br.id_manga > 0 AND br.id_manga = m.id_manga AND m.statut = 1
      LEFT JOIN ak_jeux_video j ON br.id_jeu > 0 AND br.id_jeu = j.id_jeu AND j.statut = 1
      LEFT JOIN ak_jeux_video j2 ON br.related_type = 'jeu-video' AND br.id_fiche_depart ~ '^jeu[0-9]+' AND br.related_id = j2.id_jeu AND j2.statut = 1
      WHERE (a.id_anime IS NOT NULL OR m.id_manga IS NOT NULL OR j.id_jeu IS NOT NULL OR j2.id_jeu IS NOT NULL)
    `;

    const rows = await this.prisma.$queryRawUnsafe(sql, sourceKey, id);
    return rows;
  }
}
