import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { CreateSynopsisDto } from './dto/create-synopsis.dto';
import { SynopsisQueryDto } from './dto/synopsis-query.dto';
import * as crypto from 'crypto';

@Injectable()
export class SynopsisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async create(createSynopsisDto: CreateSynopsisDto, userId: number) {
    const { synopsis, type, id_fiche } = createSynopsisDto;

    // Validate that anime/manga exists
    if (type === 1) {
      const anime = await this.prisma.akAnime.findUnique({
        where: { idAnime: id_fiche },
      });
      if (!anime) {
        throw new NotFoundException('Anime introuvable');
      }
    } else if (type === 2) {
      const manga = await this.prisma.akManga.findUnique({
        where: { idManga: id_fiche },
      });
      if (!manga) {
        throw new NotFoundException('Manga introuvable');
      }
    }

    // Check if user has already submitted a synopsis for this item
    const existingSubmission = await this.prisma.akSynopsis.findFirst({
      where: {
        idMembre: userId,
        type,
        idFiche: id_fiche,
      },
    });

    if (existingSubmission) {
      throw new ConflictException('Vous avez déjà soumis un synopsis pour ce contenu');
    }

    // Sanitize synopsis content
    const sanitizedSynopsis = this.sanitizeSynopsis(synopsis);

    // Create SHA1 hash for validation (as mentioned in requirements)
    const hash = crypto.createHash('sha1');
    hash.update(sanitizedSynopsis + userId.toString() + Date.now().toString());
    const validationHash = hash.digest('hex');

    // Insert synopsis with validation = 0 (pending)
    const newSynopsis = await this.prisma.akSynopsis.create({
      data: {
        idMembre: userId,
        synopsis: sanitizedSynopsis,
        type,
        idFiche: id_fiche,
        validation: 0, // Pending validation
        date: new Date(),
      },
    });

    // Clear cache for the related content
    const cacheKey = type === 1 ? `anime:${id_fiche}` : `manga:${id_fiche}`;
    await this.cacheService.del(cacheKey);

    return {
      success: true,
      message: 'Synopsis soumis avec succès. Il sera examiné par notre équipe.',
      data: {
        id_synopsis: newSynopsis.idSynopsis,
        validation: newSynopsis.validation,
      },
    };
  }

  async findUserSubmissions(userId: number, query: SynopsisQueryDto) {
    const where: any = {
      idMembre: userId,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.id_fiche) {
      where.idFiche = query.id_fiche;
    }

    if (query.validation !== undefined) {
      where.validation = query.validation;
    }

    const submissions = await this.prisma.akSynopsis.findMany({
      where,
      orderBy: {
        date: 'desc',
      },
      include: {
        // Add relation to get anime/manga info if needed
      },
    });

    return {
      success: true,
      submissions,
    };
  }

  async hasUserSubmitted(userId: number, type: number, id_fiche: number): Promise<boolean> {
    const submission = await this.prisma.akSynopsis.findFirst({
      where: {
        idMembre: userId,
        type,
        idFiche: id_fiche,
      },
    });

    return !!submission;
  }

  // Admin/Moderation methods
  async findPendingSynopses() {
    const pendingSynopses = await this.prisma.akSynopsis.findMany({
      where: {
        validation: 0, // Only pending synopses
      },
      orderBy: {
        date: 'asc', // Oldest first for fairness
      },
      include: {
        // Join with user to get author name
        user: {
          select: {
            memberName: true,
          },
        },
      },
    });

    // Enrich with content information
    const enrichedSynopses = await Promise.all(
      pendingSynopses.map(async (synopsis) => {
        let contentTitle = 'Contenu introuvable';

        if (synopsis.type === 1) {
          // Anime
          const anime = await this.prisma.akAnime.findUnique({
            where: { idAnime: synopsis.idFiche ?? undefined },
            select: { titre: true },
          });
          contentTitle = anime?.titre || 'Anime introuvable';
        } else if (synopsis.type === 2) {
          // Manga
          const manga = await this.prisma.akManga.findUnique({
            where: { idManga: synopsis.idFiche ?? undefined },
            select: { titre: true },
          });
          contentTitle = manga?.titre || 'Manga introuvable';
        }

        return {
          id_synopsis: synopsis.idSynopsis,
          synopsis: synopsis.synopsis,
          type: synopsis.type,
          id_fiche: synopsis.idFiche,
          validation: synopsis.validation,
          date: synopsis.date,
          author_name: synopsis.user?.memberName || 'Utilisateur introuvable',
          content_title: contentTitle,
        };
      })
    );

    return {
      success: true,
      synopses: enrichedSynopses,
    };
  }

  async findAllSynopses(page: number = 1, limit: number = 20, validation?: number, search?: string) {
    const skip = (page - 1) * limit;

    // If search is provided, we need to use raw SQL to search across anime/manga titles
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;

      let synopsesRaw: any[];
      let countRaw: any[];

      if (validation !== undefined) {
        synopsesRaw = await this.prisma.$queryRaw<any[]>`
          SELECT
            s.id_synopsis,
            s.synopsis,
            s.type,
            s.id_fiche,
            s.validation,
            s.date,
            s.id_membre,
            m.member_name,
            CASE
              WHEN s.type = 1 THEN a.titre
              WHEN s.type = 2 THEN ma.titre
              ELSE 'Contenu introuvable'
            END as content_title
          FROM ak_synopsis s
          LEFT JOIN smf_members m ON s.id_membre = m.id_member
          LEFT JOIN ak_animes a ON s.type = 1 AND s.id_fiche = a.id_anime
          LEFT JOIN ak_mangas ma ON s.type = 2 AND s.id_fiche = ma.id_manga
          WHERE (
            (s.type = 1 AND a.titre ILIKE ${searchTerm})
            OR (s.type = 2 AND ma.titre ILIKE ${searchTerm})
          )
          AND s.validation = ${validation}
          ORDER BY s.date DESC
          LIMIT ${limit} OFFSET ${skip}
        `;

        countRaw = await this.prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count
          FROM ak_synopsis s
          LEFT JOIN ak_animes a ON s.type = 1 AND s.id_fiche = a.id_anime
          LEFT JOIN ak_mangas ma ON s.type = 2 AND s.id_fiche = ma.id_manga
          WHERE (
            (s.type = 1 AND a.titre ILIKE ${searchTerm})
            OR (s.type = 2 AND ma.titre ILIKE ${searchTerm})
          )
          AND s.validation = ${validation}
        `;
      } else {
        synopsesRaw = await this.prisma.$queryRaw<any[]>`
          SELECT
            s.id_synopsis,
            s.synopsis,
            s.type,
            s.id_fiche,
            s.validation,
            s.date,
            s.id_membre,
            m.member_name,
            CASE
              WHEN s.type = 1 THEN a.titre
              WHEN s.type = 2 THEN ma.titre
              ELSE 'Contenu introuvable'
            END as content_title
          FROM ak_synopsis s
          LEFT JOIN smf_members m ON s.id_membre = m.id_member
          LEFT JOIN ak_animes a ON s.type = 1 AND s.id_fiche = a.id_anime
          LEFT JOIN ak_mangas ma ON s.type = 2 AND s.id_fiche = ma.id_manga
          WHERE (
            (s.type = 1 AND a.titre ILIKE ${searchTerm})
            OR (s.type = 2 AND ma.titre ILIKE ${searchTerm})
          )
          ORDER BY s.date DESC
          LIMIT ${limit} OFFSET ${skip}
        `;

        countRaw = await this.prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count
          FROM ak_synopsis s
          LEFT JOIN ak_animes a ON s.type = 1 AND s.id_fiche = a.id_anime
          LEFT JOIN ak_mangas ma ON s.type = 2 AND s.id_fiche = ma.id_manga
          WHERE (
            (s.type = 1 AND a.titre ILIKE ${searchTerm})
            OR (s.type = 2 AND ma.titre ILIKE ${searchTerm})
          )
        `;
      }

      const total = Number(countRaw[0]?.count || 0);

      const enrichedSynopses = synopsesRaw.map((synopsis) => ({
        id_synopsis: synopsis.id_synopsis,
        synopsis: synopsis.synopsis,
        type: synopsis.type,
        id_fiche: synopsis.id_fiche,
        validation: synopsis.validation,
        date: synopsis.date,
        author_name: synopsis.member_name || 'Utilisateur introuvable',
        content_title: synopsis.content_title || 'Contenu introuvable',
      }));

      return {
        success: true,
        synopses: enrichedSynopses,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // Original logic for non-search queries
    const where: any = {};
    if (validation !== undefined) {
      where.validation = validation;
    }

    const [synopses, total] = await Promise.all([
      this.prisma.akSynopsis.findMany({
        where,
        orderBy: {
          date: 'desc', // Most recent first
        },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              memberName: true,
            },
          },
        },
      }),
      this.prisma.akSynopsis.count({ where }),
    ]);

    // Enrich with content information
    const enrichedSynopses = await Promise.all(
      synopses.map(async (synopsis) => {
        let contentTitle = 'Contenu introuvable';

        if (synopsis.type === 1) {
          const anime = await this.prisma.akAnime.findUnique({
            where: { idAnime: synopsis.idFiche ?? undefined },
            select: { titre: true, niceUrl: true },
          });
          contentTitle = anime?.titre || 'Anime introuvable';
        } else if (synopsis.type === 2) {
          const manga = await this.prisma.akManga.findUnique({
            where: { idManga: synopsis.idFiche ?? undefined },
            select: { titre: true, niceUrl: true },
          });
          contentTitle = manga?.titre || 'Manga introuvable';
        }

        return {
          id_synopsis: synopsis.idSynopsis,
          synopsis: synopsis.synopsis,
          type: synopsis.type,
          id_fiche: synopsis.idFiche,
          validation: synopsis.validation,
          date: synopsis.date,
          author_name: synopsis.user?.memberName || 'Utilisateur introuvable',
          content_title: contentTitle,
        };
      })
    );

    return {
      success: true,
      synopses: enrichedSynopses,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async validateSynopsis(
    synopsisId: number,
    validation: number,
    moderatorId: number,
    editedSynopsis?: string,
    customAuthor?: string,
  ) {
    const synopsis = await this.prisma.akSynopsis.findUnique({
      where: { idSynopsis: synopsisId },
    });

    if (!synopsis) {
      throw new NotFoundException('Synopsis introuvable');
    }

    if (synopsis.validation !== 0) {
      throw new BadRequestException('Ce synopsis a déjà été traité');
    }

    // Use edited synopsis if provided, otherwise use original
    const finalSynopsis = editedSynopsis || synopsis.synopsis;

    // Update synopsis validation status (and optionally the synopsis text)
    const updatedSynopsis = await this.prisma.akSynopsis.update({
      where: { idSynopsis: synopsisId },
      data: {
        validation,
        synopsis: finalSynopsis,
      },
    });

    // If validated (validation = 1), update the anime/manga table and user stats
    if (validation === 1) {
      // Use custom author if provided, otherwise use original author
      const attribution = customAuthor || await this.getUserAttribution(synopsis.idMembre);

      if (synopsis.type === 1) {
        // Update anime synopsis
        await this.prisma.akAnime.update({
          where: { idAnime: synopsis.idFiche ?? undefined },
          data: {
            synopsis: `${finalSynopsis}\n\nSynopsis soumis par ${attribution}`,
          },
        });
      } else if (synopsis.type === 2) {
        // Update manga synopsis
        await this.prisma.akManga.update({
          where: { idManga: synopsis.idFiche ?? undefined },
          data: {
            synopsis: `${finalSynopsis}\n\nSynopsis soumis par ${attribution}`,
          },
        });
      }

      // Increment user's synopsis count
      await this.prisma.smfMember.update({
        where: { idMember: synopsis.idMembre },
        data: {
          nbSynopsis: {
            increment: 1,
          },
        },
      });

      // Clear cache
      const cacheKey = synopsis.type === 1 ? `anime:${synopsis.idFiche}` : `manga:${synopsis.idFiche}`;
      await this.cacheService.del(cacheKey);
    }

    return {
      success: true,
      message: validation === 1 ? 'Synopsis validé et publié' : 'Synopsis rejeté',
      data: updatedSynopsis,
    };
  }

  private sanitizeSynopsis(synopsis: string): string {
    // Remove potentially dangerous HTML/script tags
    let sanitized = synopsis.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  }

  private async getUserAttribution(userId: number): Promise<string> {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: userId },
      select: { memberName: true },
    });

    return user?.memberName || 'Utilisateur anonyme';
  }
}