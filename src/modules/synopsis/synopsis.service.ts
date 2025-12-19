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

  async findAllSynopses(page: number = 1, limit: number = 20, validation?: number) {
    const skip = (page - 1) * limit;

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

  async validateSynopsis(synopsisId: number, validation: number, moderatorId: number) {
    const synopsis = await this.prisma.akSynopsis.findUnique({
      where: { idSynopsis: synopsisId },
    });

    if (!synopsis) {
      throw new NotFoundException('Synopsis introuvable');
    }

    if (synopsis.validation !== 0) {
      throw new BadRequestException('Ce synopsis a déjà été traité');
    }

    // Update synopsis validation status
    const updatedSynopsis = await this.prisma.akSynopsis.update({
      where: { idSynopsis: synopsisId },
      data: { validation },
    });

    // If validated (validation = 1), update the anime/manga table and user stats
    if (validation === 1) {
      const attribution = await this.getUserAttribution(synopsis.idMembre);
      
      if (synopsis.type === 1) {
        // Update anime synopsis
        await this.prisma.akAnime.update({
          where: { idAnime: synopsis.idFiche ?? undefined },
          data: {
            synopsis: `${synopsis.synopsis}\n\nSynopsis soumis par ${attribution}`,
          },
        });
      } else if (synopsis.type === 2) {
        // Update manga synopsis
        await this.prisma.akManga.update({
          where: { idManga: synopsis.idFiche ?? undefined },
          data: {
            synopsis: `${synopsis.synopsis}\n\nSynopsis soumis par ${attribution}`,
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