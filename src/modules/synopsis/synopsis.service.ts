import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSynopsisDto } from './dto/create-synopsis.dto';
import { SynopsisQueryDto } from './dto/synopsis-query.dto';
import * as crypto from 'crypto';

@Injectable()
export class SynopsisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly notificationsService: NotificationsService,
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

    // Check if user has already submitted a synopsis for this item (pending or validated)
    // Rejected submissions (validation=2) don't block re-submission
    const existingSubmission = await this.prisma.akSynopsis.findFirst({
      where: {
        idMembre: userId,
        type,
        idFiche: id_fiche,
        validation: { in: [0, 1] },
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
    });

    // Bulk-fetch anime and manga titles (same pattern as findPendingSynopses)
    const animeIds = submissions
      .filter(s => s.type === 1 && s.idFiche)
      .map(s => s.idFiche!);

    const mangaIds = submissions
      .filter(s => s.type === 2 && s.idFiche)
      .map(s => s.idFiche!);

    const [animes, mangas] = await Promise.all([
      animeIds.length > 0
        ? this.prisma.akAnime.findMany({
            where: { idAnime: { in: animeIds } },
            select: { idAnime: true, titre: true, niceUrl: true },
          })
        : [],
      mangaIds.length > 0
        ? this.prisma.akManga.findMany({
            where: { idManga: { in: mangaIds } },
            select: { idManga: true, titre: true, niceUrl: true },
          })
        : [],
    ]);

    const animeMap = new Map<number, any>(animes.map((a: any) => [a.idAnime, a]));
    const mangaMap = new Map<number, any>(mangas.map((m: any) => [m.idManga, m]));

    const enrichedSubmissions = submissions.map((s) => {
      let content_title = 'Contenu introuvable';
      let content_nice_url: string | null = null;

      if (s.type === 1 && s.idFiche) {
        const anime = animeMap.get(s.idFiche);
        content_title = anime?.titre || 'Anime introuvable';
        content_nice_url = anime?.niceUrl || null;
      } else if (s.type === 2 && s.idFiche) {
        const manga = mangaMap.get(s.idFiche);
        content_title = manga?.titre || 'Manga introuvable';
        content_nice_url = manga?.niceUrl || null;
      }

      return {
        id_synopsis: s.idSynopsis,
        synopsis: s.synopsis,
        type: s.type,
        id_fiche: s.idFiche,
        validation: s.validation,
        date: s.date,
        content_title,
        content_nice_url,
      };
    });

    return {
      success: true,
      submissions: enrichedSubmissions,
    };
  }

  async hasUserSubmitted(userId: number, type: number, id_fiche: number): Promise<boolean> {
    const submission = await this.prisma.akSynopsis.findFirst({
      where: {
        idMembre: userId,
        type,
        idFiche: id_fiche,
        validation: { in: [0, 1] }, // Only pending or validated — rejected (2) don't count
      },
    });

    return !!submission;
  }

  // Admin/Moderation methods
  async getPendingCount(): Promise<{ count: number }> {
    const count = await this.prisma.akSynopsis.count({
      where: { validation: 0 },
    });
    return { count };
  }

  async findPendingSynopses() {
    const pendingSynopses = await this.prisma.akSynopsis.findMany({
      where: {
        validation: 0,
      },
      orderBy: {
        date: 'asc',
      },
      include: {
        user: {
          select: {
            memberName: true,
          },
        },
      },
    });

    // Fetch all anime and manga IDs in bulk
    const animeIds = pendingSynopses
      .filter(s => s.type === 1 && s.idFiche)
      .map(s => s.idFiche!);

    const mangaIds = pendingSynopses
      .filter(s => s.type === 2 && s.idFiche)
      .map(s => s.idFiche!);

    // Bulk fetch animes and mangas
    const [animes, mangas] = await Promise.all([
      this.prisma.akAnime.findMany({
        where: { idAnime: { in: animeIds } },
        select: { idAnime: true, titre: true },
      }),
      this.prisma.akManga.findMany({
        where: { idManga: { in: mangaIds } },
        select: { idManga: true, titre: true },
      }),
    ]);

    // Create lookup maps
    const animeMap = new Map(animes.map(a => [a.idAnime, a.titre]));
    const mangaMap = new Map(mangas.map(m => [m.idManga, m.titre]));

    // Enrich synopses
    const enrichedSynopses = pendingSynopses.map((synopsis) => {
      let contentTitle = 'Contenu introuvable';

      if (synopsis.type === 1 && synopsis.idFiche) {
        contentTitle = animeMap.get(synopsis.idFiche) || 'Anime introuvable';
      } else if (synopsis.type === 2 && synopsis.idFiche) {
        contentTitle = mangaMap.get(synopsis.idFiche) || 'Manga introuvable';
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
    });

    return {
      success: true,
      synopses: enrichedSynopses,
    };
  }

  async findAllSynopses(page: number = 1, limit: number = 20, validation?: number, search?: string) {
    const skip = (page - 1) * limit;

    let synopsesRaw: any[];
    let countRaw: any[];

    // Build WHERE clause conditions
    const conditions: string[] = [];
    const countConditions: string[] = [];

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;

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
          END as content_title,
          CASE
            WHEN s.type = 1 THEN a.nice_url
            WHEN s.type = 2 THEN ma.nice_url
            ELSE NULL
          END as content_nice_url
        FROM ak_synopsis s
        LEFT JOIN smf_members m ON s.id_membre = m.id_member
        LEFT JOIN ak_animes a ON s.id_fiche = a.id_anime
        LEFT JOIN ak_mangas ma ON s.id_fiche = ma.id_manga
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
        LEFT JOIN ak_animes a ON s.id_fiche = a.id_anime
        LEFT JOIN ak_mangas ma ON s.id_fiche = ma.id_manga
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
          END as content_title,
          CASE
            WHEN s.type = 1 THEN a.nice_url
            WHEN s.type = 2 THEN ma.nice_url
            ELSE NULL
          END as content_nice_url
        FROM ak_synopsis s
        LEFT JOIN smf_members m ON s.id_membre = m.id_member
        LEFT JOIN ak_animes a ON s.id_fiche = a.id_anime
        LEFT JOIN ak_mangas ma ON s.id_fiche = ma.id_manga
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
        LEFT JOIN ak_animes a ON s.id_fiche = a.id_anime
        LEFT JOIN ak_mangas ma ON s.id_fiche = ma.id_manga
        WHERE (
          (s.type = 1 AND a.titre ILIKE ${searchTerm})
          OR (s.type = 2 AND ma.titre ILIKE ${searchTerm})
        )
      `;
      }
    } else {
      // Non-search queries - also use raw SQL for consistency and performance
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
          END as content_title,
          CASE
            WHEN s.type = 1 THEN a.nice_url
            WHEN s.type = 2 THEN ma.nice_url
            ELSE NULL
          END as content_nice_url
        FROM ak_synopsis s
        LEFT JOIN smf_members m ON s.id_membre = m.id_member
        LEFT JOIN ak_animes a ON s.id_fiche = a.id_anime
        LEFT JOIN ak_mangas ma ON s.id_fiche = ma.id_manga
        WHERE s.validation = ${validation}
        ORDER BY s.date DESC
        LIMIT ${limit} OFFSET ${skip}
      `;

        countRaw = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count
        FROM ak_synopsis s
        WHERE s.validation = ${validation}
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
          END as content_title,
          CASE
            WHEN s.type = 1 THEN a.nice_url
            WHEN s.type = 2 THEN ma.nice_url
            ELSE NULL
          END as content_nice_url
        FROM ak_synopsis s
        LEFT JOIN smf_members m ON s.id_membre = m.id_member
        LEFT JOIN ak_animes a ON s.id_fiche = a.id_anime
        LEFT JOIN ak_mangas ma ON s.id_fiche = ma.id_manga
        ORDER BY s.date DESC
        LIMIT ${limit} OFFSET ${skip}
      `;

        countRaw = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count
        FROM ak_synopsis s
      `;
      }
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
      content_nice_url: synopsis.content_nice_url || null,
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

    // Send notification to the submitting user (fire-and-forget)
    this.sendSynopsisNotification(synopsis, validation).catch((err) => {
      // Silently log errors — don't block the response
      console.error('Failed to send synopsis notification:', err);
    });

    return {
      success: true,
      message: validation === 1 ? 'Synopsis validé et publié' : 'Synopsis rejeté',
      data: updatedSynopsis,
    };
  }

  async resetToPending(synopsisId: number, moderatorId: number) {
    const synopsis = await this.prisma.akSynopsis.findUnique({
      where: { idSynopsis: synopsisId },
    });

    if (!synopsis) {
      throw new NotFoundException('Synopsis introuvable');
    }

    if (synopsis.validation !== 2) {
      throw new BadRequestException('Seuls les synopsis rejetés peuvent être remis en attente');
    }

    await this.prisma.akSynopsis.update({
      where: { idSynopsis: synopsisId },
      data: { validation: 0 },
    });

    return {
      success: true,
      message: 'Synopsis remis en attente de validation',
    };
  }

  private async sendSynopsisNotification(
    synopsis: { idSynopsis: number; idMembre: number; type: number; idFiche: number | null },
    validation: number,
  ) {
    // Fetch content title
    let contentTitle = 'Contenu inconnu';
    if (synopsis.type === 1 && synopsis.idFiche) {
      const anime = await this.prisma.akAnime.findUnique({
        where: { idAnime: synopsis.idFiche },
        select: { titre: true },
      });
      contentTitle = anime?.titre || 'Anime inconnu';
    } else if (synopsis.type === 2 && synopsis.idFiche) {
      const manga = await this.prisma.akManga.findUnique({
        where: { idManga: synopsis.idFiche },
        select: { titre: true },
      });
      contentTitle = manga?.titre || 'Manga inconnu';
    }

    const isValidated = validation === 1;
    await this.notificationsService.sendNotification({
      userId: synopsis.idMembre,
      type: 'review_moderated',
      title: `Synopsis : ${contentTitle}`,
      message: isValidated
        ? `Votre synopsis pour ${contentTitle} a été validé et publié !`
        : `Votre synopsis pour ${contentTitle} a été rejeté.`,
      priority: 'medium',
      data: {
        synopsisId: synopsis.idSynopsis,
        type: synopsis.type,
        idFiche: synopsis.idFiche,
      },
    });
  }

  async updateSynopsisOnly(
    synopsisId: number,
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

    // Prepare update data - only update if values are provided
    const updateData: any = {};

    if (editedSynopsis) {
      updateData.synopsis = editedSynopsis;
    }

    // Note: customAuthor is stored separately and used during validation
    // We're not changing the validation status here, just updating the synopsis text

    const updatedSynopsis = await this.prisma.akSynopsis.update({
      where: { idSynopsis: synopsisId },
      data: updateData,
    });

    return {
      success: true,
      message: 'Synopsis mis à jour avec succès',
      data: {
        id_synopsis: updatedSynopsis.idSynopsis,
        validation: updatedSynopsis.validation,
        customAuthor: customAuthor, // Return for frontend tracking
      },
    };
  }

  async resubmitSynopsis(synopsisId: number, userId: number, newSynopsis: string) {
    const synopsis = await this.prisma.akSynopsis.findUnique({
      where: { idSynopsis: synopsisId },
    });

    if (!synopsis) {
      throw new NotFoundException('Synopsis introuvable');
    }

    if (synopsis.idMembre !== userId) {
      throw new BadRequestException('Vous ne pouvez modifier que vos propres synopsis');
    }

    if (synopsis.validation !== 2) {
      throw new BadRequestException('Seuls les synopsis rejetés peuvent être resoumis');
    }

    const sanitized = this.sanitizeSynopsis(newSynopsis);

    await this.prisma.akSynopsis.update({
      where: { idSynopsis: synopsisId },
      data: {
        synopsis: sanitized,
        validation: 0,
      },
    });

    return {
      success: true,
      message: 'Synopsis resoumis avec succès. Il sera réexaminé par notre équipe.',
    };
  }

  async bulkDelete(ids: number[]): Promise<{ deletedCount: number }> {
    // Safety: only delete rejected synopsis (validation = 2)
    const result = await this.prisma.akSynopsis.deleteMany({
      where: {
        idSynopsis: { in: ids },
        validation: 2,
      },
    });

    return { deletedCount: result.count };
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