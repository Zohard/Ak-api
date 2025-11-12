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
      where.plateforme = { contains: plateforme, mode: 'insensitive' };
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
}
