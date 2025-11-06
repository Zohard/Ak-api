import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { hasAdminAccess, getRoleName } from '../../shared/constants/rbac.constants';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = ((page || 1) - 1) * (limit || 20);

    // Build where clause for search
    const where = search
      ? {
          OR: [
            { memberName: { contains: search, mode: 'insensitive' as const } },
            { realName: { contains: search, mode: 'insensitive' as const } },
            {
              emailAddress: { contains: search, mode: 'insensitive' as const },
            },
          ],
        }
      : {};

    // Build order by clause
    const orderBy = { [sortBy || 'dateRegistered']: sortOrder || 'desc' };

    const [users, total] = await Promise.all([
      this.prisma.smfMember.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          idMember: true,
          memberName: true,
          realName: true,
          dateRegistered: true,
          lastLogin: true,
          posts: true,
          nbCritiques: true,
          nbSynopsis: true,
          nbContributions: true,
          experience: true,
          idGroup: true,
          avatar: true,
          bannerImage: true,
          personalText: true,
          location: true,
          // Don't include password fields
        },
      }),
      this.prisma.smfMember.count({ where }),
    ]);

    return {
      users: users.map(user => this.sanitizeUser(user)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
      select: {
        idMember: true,
        memberName: true,
        realName: true,
        emailAddress: true,
        dateRegistered: true,
        lastLogin: true,
        posts: true,
        nbCritiques: true,
        nbSynopsis: true,
        nbContributions: true,
        experience: true,
        idGroup: true,
        avatar: true,
        bannerImage: true,
        personalText: true,
        signature: true,
        location: true,
        websiteTitle: true,
        websiteUrl: true,
        birthdate: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return this.sanitizeUser(user);
  }

  async update(
    id: number,
    updateProfileDto: UpdateProfileDto,
    currentUserId: number,
    isAdmin: boolean = false,
  ) {
    // Check if user can update this profile
    if (id !== currentUserId && !isAdmin) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que votre propre profil',
      );
    }

    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const { email, currentPassword, newPassword, ...otherFields } =
      updateProfileDto;

    // Build update data
    const updateData: any = {};

    // Handle email change (requires current password)
    if (email && email !== user.emailAddress) {
      if (!currentPassword) {
        throw new BadRequestException(
          "Mot de passe actuel requis pour changer l'email",
        );
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwd,
      );
      if (!isPasswordValid) {
        throw new BadRequestException('Mot de passe actuel incorrect');
      }

      // Check if email is already taken
      const existingUser = await this.prisma.smfMember.findFirst({
        where: {
          emailAddress: email,
          idMember: { not: id },
        },
      });

      if (existingUser) {
        throw new BadRequestException('Cette adresse email est déjà utilisée');
      }

      updateData.emailAddress = email;
    }

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        throw new BadRequestException(
          'Mot de passe actuel requis pour changer le mot de passe',
        );
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwd,
      );
      if (!isPasswordValid) {
        throw new BadRequestException('Mot de passe actuel incorrect');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      updateData.passwd = hashedPassword;
    }

    // Handle pseudo/username change (memberName)
    if (
      (otherFields as any).memberName &&
      (otherFields as any).memberName !== user.memberName
    ) {
      const newMemberName = String((otherFields as any).memberName).trim();
      if (newMemberName.length < 3) {
        throw new BadRequestException(
          "Le pseudo doit contenir au moins 3 caractères",
        );
      }

      const existingByName = await this.prisma.smfMember.findFirst({
        where: {
          memberName: newMemberName,
          idMember: { not: id },
        },
      });

      if (existingByName) {
        throw new BadRequestException(
          'Ce pseudo est déjà utilisé par un autre utilisateur',
        );
      }

      updateData.memberName = newMemberName;
      delete (otherFields as any).memberName;
    }

    // Handle other fields
    Object.entries(otherFields).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'birthdate' && typeof value === 'string') {
          // Convert YYYY-MM-DD string to DateTime for Prisma
          updateData[key] = new Date(value + 'T00:00:00.000Z');
        } else {
          updateData[key] = value;
        }
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Aucune modification fournie');
    }

    const updatedUser = await this.prisma.smfMember.update({
      where: { idMember: id },
      data: updateData,
      select: {
        idMember: true,
        memberName: true,
        realName: true,
        emailAddress: true,
        dateRegistered: true,
        lastLogin: true,
        posts: true,
        nbCritiques: true,
        nbSynopsis: true,
        nbContributions: true,
        experience: true,
        idGroup: true,
        avatar: true,
        bannerImage: true,
        personalText: true,
        signature: true,
        location: true,
        websiteTitle: true,
        websiteUrl: true,
        birthdate: true,
      },
    });

    // If password was changed, revoke all refresh tokens
    if (newPassword) {
      await this.prisma.akRefreshToken.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      });
    }

    return this.sanitizeUser(updatedUser);
  }

  async create(createUserDto: CreateUserDto) {
    const { password, memberName, emailAddress, ...otherFields } =
      createUserDto;

    // Check if user already exists
    const existingUser = await this.prisma.smfMember.findFirst({
      where: {
        OR: [{ memberName }, { emailAddress }],
      },
    });

    if (existingUser) {
      throw new BadRequestException(
        'Un utilisateur avec ce nom ou cette email existe déjà',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await this.prisma.smfMember.create({
      data: {
        memberName,
        emailAddress,
        passwd: hashedPassword,
        dateRegistered: Math.floor(Date.now() / 1000),
        idGroup: otherFields.idGroup || 0,
        realName: otherFields.realName || memberName,
      } as any,
      select: {
        idMember: true,
        memberName: true,
        realName: true,
        emailAddress: true,
        dateRegistered: true,
        idGroup: true,
      },
    });

    return this.sanitizeUser(user);
  }

  async remove(id: number, currentUserId: number, isAdmin: boolean = false) {
    // Only admin can delete users, or users can delete themselves
    if (id !== currentUserId && !isAdmin) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que votre propre compte',
      );
    }

    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Don't allow deleting admin users unless requested by another admin
    if (hasAdminAccess(user.idGroup) && !isAdmin) {
      throw new ForbiddenException('Impossible de supprimer un administrateur');
    }

    await this.prisma.smfMember.delete({
      where: { idMember: id },
    });

    return { message: 'Utilisateur supprimé avec succès' };
  }

  async getUserStats(id: number) {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
      select: {
        idMember: true,
        memberName: true,
        posts: true,
        nbCritiques: true,
        nbSynopsis: true,
        nbContributions: true,
        experience: true,
        dateRegistered: true,
        lastLogin: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Run ALL queries in parallel for HUGE performance improvement!
    const [
      reviewStats,
      animeCollectionResult,
      mangaCollectionResult,
      ratingStats,
      forumPopularityByMessages
    ] = await Promise.all([
      // Get reviews count and average rating
      this.prisma.akCritique.aggregate({
        where: { idMembre: id },
        _count: true,
        _avg: { notation: true },
      }),
      // Get anime collection count
      this.prisma.$queryRaw`
        SELECT COUNT(*) as total FROM collection_animes WHERE id_membre = ${id}
      `.catch(() => [{ total: 0 }]),
      // Get manga collection count
      this.prisma.$queryRaw`
        SELECT COUNT(*) as total FROM collection_mangas WHERE id_membre = ${id}
      `.catch(() => [{ total: 0 }]),
      // Get rating distribution
      this.prisma.$queryRaw`
        SELECT
          notation as rating,
          COUNT(*) as count
        FROM ak_critique
        WHERE id_membre = ${id}
        GROUP BY notation
        ORDER BY notation DESC
      `,
      // Get forum statistics - popularity by message count
      this.prisma.$queryRaw`
        SELECT
          b.id_board as "boardId",
          b.name as "boardName",
          COUNT(m.id_msg) as "messageCount",
          (COUNT(m.id_msg)::float / NULLIF(${user.posts}, 0) * 100) as "percentage"
        FROM smf_messages m
        JOIN smf_boards b ON m.id_board = b.id_board
        WHERE m.id_member = ${id}
        GROUP BY b.id_board, b.name
        ORDER BY "messageCount" DESC
        LIMIT 10
      `
    ]);

    const animeCount = Number((animeCollectionResult as any)[0]?.total || 0);
    const mangaCount = Number((mangaCollectionResult as any)[0]?.total || 0);

    // Get genre stats and collection tags in parallel (optimized queries)
    const [genreStats, collectionTagStatsAnime, collectionTagStatsManga] = await Promise.all([
      // Genre statistics from reviews - SIMPLIFIED query
      this.prisma.$queryRaw`
        SELECT
          t.tag_name as name,
          COUNT(*) as count
        FROM ak_critique c
        INNER JOIN ak_animes a ON c.id_anime = a.id_anime
        INNER JOIN ak_tag2fiche tf ON a.id_anime = tf.id_fiche AND tf.type = 'anime'
        INNER JOIN ak_tags t ON tf.id_tag = t.id_tag
        WHERE c.id_membre = ${id}
        GROUP BY t.tag_name
        ORDER BY count DESC
        LIMIT 5
        UNION ALL
        SELECT
          t.tag_name as name,
          COUNT(*) as count
        FROM ak_critique c
        INNER JOIN ak_mangas m ON c.id_manga = m.id_manga
        INNER JOIN ak_tag2fiche tf ON m.id_manga = tf.id_fiche AND tf.type = 'manga'
        INNER JOIN ak_tags t ON tf.id_tag = t.id_tag
        WHERE c.id_membre = ${id}
        GROUP BY t.tag_name
        ORDER BY count DESC
        LIMIT 5
      `.catch(() => []),
      // Anime collection tag stats - SIMPLIFIED
      this.prisma.$queryRaw`
        SELECT
          t.id_tag as id,
          t.tag_name as name,
          COUNT(*) as count,
          AVG(ca.note) as "avgRating"
        FROM collection_animes ca
        INNER JOIN ak_animes a ON ca.id_anime = a.id_anime
        INNER JOIN ak_tag2fiche tf ON a.id_anime = tf.id_fiche AND tf.type = 'anime'
        INNER JOIN ak_tags t ON tf.id_tag = t.id_tag
        WHERE ca.id_membre = ${id} AND ca.note IS NOT NULL
        GROUP BY t.id_tag, t.tag_name
        ORDER BY count DESC, "avgRating" DESC
        LIMIT 5
      `.catch(() => []),
      // Manga collection tag stats - SIMPLIFIED
      this.prisma.$queryRaw`
        SELECT
          t.id_tag as id,
          t.tag_name as name,
          COUNT(*) as count,
          AVG(cm.note) as "avgRating"
        FROM collection_mangas cm
        INNER JOIN ak_mangas m ON cm.id_manga = m.id_manga
        INNER JOIN ak_tag2fiche tf ON m.id_manga = tf.id_fiche AND tf.type = 'manga'
        INNER JOIN ak_tags t ON tf.id_tag = t.id_tag
        WHERE cm.id_membre = ${id} AND cm.note IS NOT NULL
        GROUP BY t.id_tag, t.tag_name
        ORDER BY count DESC, "avgRating" DESC
        LIMIT 5
      `.catch(() => [])
    ]);

    const collectionTagStats = {
      animeTop: (collectionTagStatsAnime as any[]).map(stat => ({
        id: Number(stat.id),
        name: stat.name,
        count: Number(stat.count),
        avgRating: stat.avgRating ? Number(stat.avgRating) : null
      })),
      mangaTop: (collectionTagStatsManga as any[]).map(stat => ({
        id: Number(stat.id),
        name: stat.name,
        count: Number(stat.count),
        avgRating: stat.avgRating ? Number(stat.avgRating) : null
      }))
    };

    const forumPopularityByActivity = [];

    return {
      totalReviews: reviewStats._count,
      animeCount,
      mangaCount,
      genreStats: (genreStats as any[]).map(stat => ({
        name: stat.name,
        count: Number(stat.count)
      })),
      ratingStats: (ratingStats as any[]).map(stat => ({
        rating: stat.rating,
        count: Number(stat.count)
      })),
      collectionTagStats,
      forumStats: {
        totalPosts: user.posts,
        popularityByMessages: (forumPopularityByMessages as any[]).map(stat => ({
          boardId: Number(stat.boardId),
          boardName: stat.boardName,
          messageCount: Number(stat.messageCount),
          percentage: stat.percentage ? Number(stat.percentage).toFixed(2) : '0.00'
        })),
        popularityByActivity: (forumPopularityByActivity as any[]).map(stat => ({
          boardId: Number(stat.boardId),
          boardName: stat.boardName,
          userMessageCount: Number(stat.userMessageCount),
          boardTotalPosts: Number(stat.boardTotalPosts),
          activityPercentage: stat.activityPercentage ? Number(stat.activityPercentage).toFixed(2) : '0.00'
        }))
      },
      joinDate: new Date(user.dateRegistered * 1000).toISOString(),
      lastLoginDate: user.lastLogin
        ? new Date(user.lastLogin * 1000).toISOString()
        : null,
    };
  }

  async getUserActivity(id: number, limit: number = 10) {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
      select: { idMember: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Get recent reviews
    const recentReviews = await this.prisma.$queryRaw`
      SELECT
        'review' as type,
        EXTRACT(EPOCH FROM c.date_critique) as date,
        COALESCE(a.titre, m.titre) as title,
        c.id_critique as id,
        c.nice_url as "reviewSlug",
        CASE
          WHEN c.id_anime IS NOT NULL THEN CONCAT(a.nice_url, '-', a.id_anime)
          WHEN c.id_manga IS NOT NULL THEN CONCAT(m.nice_url, '-', m.id_manga)
          ELSE NULL
        END as "niceUrl",
        CASE
          WHEN c.id_anime IS NOT NULL THEN 'anime'
          WHEN c.id_manga IS NOT NULL THEN 'manga'
          ELSE NULL
        END as "mediaType"
      FROM ak_critique c
      LEFT JOIN ak_animes a ON c.id_anime = a.id_anime
      LEFT JOIN ak_mangas m ON c.id_manga = m.id_manga
      WHERE c.id_membre = ${id}
      ORDER BY c.date_critique DESC
      LIMIT ${limit}
    `;

    // Get recent collection additions
    const recentCollections = await this.prisma.$queryRaw`
      (SELECT
        'anime_added' as type,
        EXTRACT(EPOCH FROM ca.created_at) as date,
        a.titre as title,
        ca.id_anime as id,
        NULL as "reviewSlug",
        CONCAT(a.nice_url, '-', a.id_anime) as "niceUrl",
        'anime' as "mediaType"
      FROM collection_animes ca
      LEFT JOIN ak_animes a ON ca.id_anime = a.id_anime
      WHERE ca.id_membre = ${id}
      ORDER BY ca.created_at DESC
      LIMIT ${Math.ceil(limit / 2)})
      UNION ALL
      (SELECT
        'manga_added' as type,
        EXTRACT(EPOCH FROM cm.created_at) as date,
        m.titre as title,
        cm.id_manga as id,
        NULL as "reviewSlug",
        CONCAT(m.nice_url, '-', m.id_manga) as "niceUrl",
        'manga' as "mediaType"
      FROM collection_mangas cm
      LEFT JOIN ak_mangas m ON cm.id_manga = m.id_manga
      WHERE cm.id_membre = ${id}
      ORDER BY cm.created_at DESC
      LIMIT ${Math.floor(limit / 2)})
    `;

    const allActivities = [
      ...(recentReviews as any[]),
      ...(recentCollections as any[])
    ].sort((a, b) => new Date(b.date * 1000).getTime() - new Date(a.date * 1000).getTime())
      .slice(0, limit);

    return {
      activities: allActivities
    };
  }

  async getUserRecommendations(
    id: number,
    limit: number = 12,
    page: number = 1,
    genre?: string,
    sortBy?: string,
    similarTo?: number,
    similarToType?: 'anime' | 'manga',
    tags?: string
  ) {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
      select: { idMember: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    let userGenres: any[] = [];
    let originalMediaTitle = '';
    let originalMediaTagCount = 0;

    // If similarTo is provided, get tags from that specific media
    if (similarTo && similarToType) {
      // Fetch the original media title
      const originalMedia = similarToType === 'anime'
        ? await this.prisma.$queryRaw`SELECT titre FROM ak_animes WHERE id_anime = ${similarTo} LIMIT 1` as any[]
        : await this.prisma.$queryRaw`SELECT titre FROM ak_mangas WHERE id_manga = ${similarTo} LIMIT 1` as any[];

      originalMediaTitle = originalMedia.length > 0 ? originalMedia[0].titre : '';

      if (tags) {
        // Use provided tags (from "Include all tags" checkbox)
        const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
        userGenres = tagList.map(tag => ({ genre: tag, count: 1 }));
        originalMediaTagCount = tagList.length;
      } else {
        // Get tags from the specified media
        const mediaIdColumn = similarToType === 'anime' ? 'id_anime' : 'id_manga';
        userGenres = await this.prisma.$queryRaw`
          SELECT DISTINCT
            t.tag_name as genre,
            1 as count
          FROM ak_tag2fiche tf
          JOIN ak_tags t ON tf.id_tag = t.id_tag
          WHERE tf.id_fiche = ${similarTo}
            AND tf.type = ${similarToType}
            AND t.tag_name IS NOT NULL
          LIMIT 10
        ` as any[];
        originalMediaTagCount = userGenres.length;
      }
    } else {
      // Get user's most reviewed content to find preferences (using tags system)
      userGenres = await this.prisma.$queryRaw`
        SELECT
          t.tag_name as genre,
          COUNT(*) as count
        FROM ak_critique c
        LEFT JOIN ak_tag2fiche tf_a ON c.id_anime = tf_a.id_fiche AND tf_a.type = 'anime'
        LEFT JOIN ak_tag2fiche tf_m ON c.id_manga = tf_m.id_fiche AND tf_m.type = 'manga'
        LEFT JOIN ak_tags t ON (tf_a.id_tag = t.id_tag OR tf_m.id_tag = t.id_tag)
        WHERE c.id_membre = ${id} AND t.tag_name IS NOT NULL
        GROUP BY t.tag_name
        ORDER BY count DESC
        LIMIT 3
      ` as any[];
    }

    const offset = (page - 1) * limit;

    // Build ORDER BY clause based on sortBy parameter
    const buildOrderBy = (mediaType: 'anime' | 'manga') => {
      const prefix = mediaType === 'anime' ? 'a' : 'm';
      // Anime uses nb_reviews for popularity, Manga uses nb_clics
      const popularityColumn = mediaType === 'anime' ? 'nb_reviews' : 'nb_clics';

      switch (sortBy) {
        case 'rating':
          return `${prefix}.moyennenotes DESC, ${prefix}.id_${mediaType} DESC`;
        case 'popularity':
          return `${prefix}.${popularityColumn} DESC, ${prefix}.id_${mediaType} DESC`;
        case 'date':
          return `${prefix}.annee DESC, ${prefix}.id_${mediaType} DESC`;
        case 'title':
          return `${prefix}.titre ASC`;
        default:
          return `${prefix}.moyennenotes DESC, ${prefix}.id_${mediaType} DESC`;
      }
    };

    let recommendations: any[] = [];

    // Run genre-based recommendations if either:
    // 1. User has genre preferences from their reviews
    // 2. OR a genre filter is explicitly provided
    if ((userGenres as any[]).length > 0 || genre) {
      const topGenres = (userGenres as any[]).map(g => g.genre);

      // Get anime recommendations based on favorite genres or specific genre filter
      // Support multiple genres as comma-separated string
      const genresToUse = genre
        ? genre.split(',').map(g => g.trim()).filter(Boolean)
        : topGenres;

      console.log('🎯 Genre filtering:', {
        genreParam: genre,
        topGenresFromUser: topGenres,
        genresToUse,
        requireAllGenres: genre && genresToUse.length > 1
      });

      // Skip if no genres to filter by
      if (genresToUse.length === 0) {
        console.log('⚠️ No genres to filter by, skipping genre-based recommendations');
      } else {
        const animeOrderBy = buildOrderBy('anime');

      // If tags parameter is provided (includeAllTags=true), require ALL tags
      // If multiple genres/tags are selected, require ALL of them (AND logic)
      // Otherwise, match ANY tag (user preferences)
      const requireAllTags = tags && tags.trim().length > 0;
      const requireAllGenres = genre && genresToUse.length > 1;

      const animeRecs = (requireAllTags || requireAllGenres)
        ? await this.prisma.$queryRawUnsafe(`
          SELECT
            a.id_anime as id,
            a.titre,
            a.image,
            'anime' as type,
            a.nice_url as niceUrl,
            a.moyennenotes,
            a.nb_reviews,
            a.annee,
            ${similarTo && originalMediaTitle ? `
              ROUND(
                (COUNT(DISTINCT LOWER(t.tag_name))::float / ${originalMediaTagCount}::float * 70) +
                (similarity(LOWER(a.titre), LOWER('${originalMediaTitle.replace(/'/g, "''")}')) * 30)
              ) as pertinence
            ` : 'NULL as pertinence'}
          FROM ak_animes a
          JOIN ak_tag2fiche tf ON a.id_anime = tf.id_fiche AND tf.type = 'anime'
          JOIN ak_tags t ON tf.id_tag = t.id_tag
          WHERE LOWER(t.tag_name) IN (${genresToUse.map(g => `'${g.toLowerCase()}'`).join(',')})
            AND a.statut = 1
            AND a.id_anime NOT IN (
              SELECT id_anime FROM ak_critique WHERE id_membre = ${id} AND id_anime IS NOT NULL
            )
            AND a.id_anime NOT IN (
              SELECT id_anime FROM collection_animes WHERE id_membre = ${id} AND id_anime IS NOT NULL
            )
            ${similarTo ? `AND a.id_anime != ${similarTo}` : ''}
          GROUP BY a.id_anime, a.titre, a.image, a.nice_url, a.moyennenotes, a.nb_reviews, a.annee
          HAVING COUNT(DISTINCT LOWER(t.tag_name)) = ${genresToUse.length}
          ORDER BY ${similarTo && originalMediaTitle ? 'pertinence DESC,' : ''} ${animeOrderBy}
          LIMIT ${Math.ceil(limit / 2)} OFFSET ${offset}
        `)
        : await this.prisma.$queryRawUnsafe(`
          SELECT
            a.id_anime as id,
            a.titre,
            a.image,
            'anime' as type,
            a.nice_url as niceUrl,
            a.moyennenotes,
            a.nb_reviews,
            a.annee,
            ${similarTo && originalMediaTitle ? `
              ROUND(
                (COUNT(DISTINCT CASE WHEN LOWER(t.tag_name) = ANY(ARRAY[${genresToUse.map(g => `'${g.toLowerCase()}'`).join(',')}]) THEN t.tag_name END)::float / ${originalMediaTagCount}::float * 70) +
                (similarity(LOWER(a.titre), LOWER('${originalMediaTitle.replace(/'/g, "''")}')) * 30)
              ) as pertinence
            ` : 'NULL as pertinence'}
          FROM ak_animes a
          JOIN ak_tag2fiche tf ON a.id_anime = tf.id_fiche AND tf.type = 'anime'
          JOIN ak_tags t ON tf.id_tag = t.id_tag
          WHERE LOWER(t.tag_name) = ANY(ARRAY[${genresToUse.map(g => `'${g.toLowerCase()}'`).join(',')}])
            AND a.statut = 1
            AND a.id_anime NOT IN (
              SELECT id_anime FROM ak_critique WHERE id_membre = ${id} AND id_anime IS NOT NULL
            )
            AND a.id_anime NOT IN (
              SELECT id_anime FROM collection_animes WHERE id_membre = ${id} AND id_anime IS NOT NULL
            )
            ${similarTo ? `AND a.id_anime != ${similarTo}` : ''}
          GROUP BY a.id_anime, a.titre, a.image, a.nice_url, a.moyennenotes, a.nb_reviews, a.annee
          ORDER BY ${similarTo && originalMediaTitle ? 'pertinence DESC,' : ''} ${animeOrderBy}
          LIMIT ${Math.ceil(limit / 2)} OFFSET ${offset}
        `);

      // Get manga recommendations based on favorite genres or specific genre filter
      const mangaOrderBy = buildOrderBy('manga');

      const mangaRecs = (requireAllTags || requireAllGenres)
        ? await this.prisma.$queryRawUnsafe(`
          SELECT
            m.id_manga as id,
            m.titre,
            m.image,
            'manga' as type,
            m.nice_url as niceUrl,
            m.moyennenotes,
            m.nb_clics,
            m.annee,
            ${similarTo && originalMediaTitle ? `
              ROUND(
                (COUNT(DISTINCT LOWER(t.tag_name))::float / ${originalMediaTagCount}::float * 70) +
                (similarity(LOWER(m.titre), LOWER('${originalMediaTitle.replace(/'/g, "''")}')) * 30)
              ) as pertinence
            ` : 'NULL as pertinence'}
          FROM ak_mangas m
          JOIN ak_tag2fiche tf ON m.id_manga = tf.id_fiche AND tf.type = 'manga'
          JOIN ak_tags t ON tf.id_tag = t.id_tag
          WHERE LOWER(t.tag_name) IN (${genresToUse.map(g => `'${g.toLowerCase()}'`).join(',')})
            AND m.statut = 1
            AND m.id_manga NOT IN (
              SELECT id_manga FROM ak_critique WHERE id_membre = ${id} AND id_manga IS NOT NULL
            )
            AND m.id_manga NOT IN (
              SELECT id_manga FROM collection_mangas WHERE id_membre = ${id} AND id_manga IS NOT NULL
            )
            ${similarTo && similarToType === 'manga' ? `AND m.id_manga != ${similarTo}` : ''}
          GROUP BY m.id_manga, m.titre, m.image, m.nice_url, m.moyennenotes, m.nb_clics, m.annee
          HAVING COUNT(DISTINCT LOWER(t.tag_name)) = ${genresToUse.length}
          ORDER BY ${similarTo && originalMediaTitle ? 'pertinence DESC,' : ''} ${mangaOrderBy}
          LIMIT ${Math.floor(limit / 2)} OFFSET ${offset}
        `)
        : await this.prisma.$queryRawUnsafe(`
          SELECT
            m.id_manga as id,
            m.titre,
            m.image,
            'manga' as type,
            m.nice_url as niceUrl,
            m.moyennenotes,
            m.nb_clics,
            m.annee,
            ${similarTo && originalMediaTitle ? `
              ROUND(
                (COUNT(DISTINCT CASE WHEN LOWER(t.tag_name) = ANY(ARRAY[${genresToUse.map(g => `'${g.toLowerCase()}'`).join(',')}]) THEN t.tag_name END)::float / ${originalMediaTagCount}::float * 70) +
                (similarity(LOWER(m.titre), LOWER('${originalMediaTitle.replace(/'/g, "''")}')) * 30)
              ) as pertinence
            ` : 'NULL as pertinence'}
          FROM ak_mangas m
          JOIN ak_tag2fiche tf ON m.id_manga = tf.id_fiche AND tf.type = 'manga'
          JOIN ak_tags t ON tf.id_tag = t.id_tag
          WHERE LOWER(t.tag_name) = ANY(ARRAY[${genresToUse.map(g => `'${g.toLowerCase()}'`).join(',')}])
            AND m.statut = 1
            AND m.id_manga NOT IN (
              SELECT id_manga FROM ak_critique WHERE id_membre = ${id} AND id_manga IS NOT NULL
            )
            AND m.id_manga NOT IN (
              SELECT id_manga FROM collection_mangas WHERE id_membre = ${id} AND id_manga IS NOT NULL
            )
            ${similarTo && similarToType === 'manga' ? `AND m.id_manga != ${similarTo}` : ''}
          GROUP BY m.id_manga, m.titre, m.image, m.nice_url, m.moyennenotes, m.nb_clics, m.annee
          ORDER BY ${similarTo && originalMediaTitle ? 'pertinence DESC,' : ''} ${mangaOrderBy}
          LIMIT ${Math.floor(limit / 2)} OFFSET ${offset}
        `);

      recommendations = [
        ...(animeRecs as any[]),
        ...(mangaRecs as any[])
      ];
      }
    }

    // If not enough recommendations, add popular items
    if (recommendations.length < limit) {
      const remaining = limit - recommendations.length;
      const animeOrderBy = buildOrderBy('anime');
      const mangaOrderBy = buildOrderBy('manga');

      // Build genre filter clause if genre is specified
      // Support multiple genres as comma-separated string
      const genreJoinAndWhere = genre
        ? `
          JOIN ak_tag2fiche tf ON %TABLE%.%ID% = tf.id_fiche AND tf.type = '%TYPE%'
          JOIN ak_tags t ON tf.id_tag = t.id_tag AND LOWER(t.tag_name) IN (${genre.split(',').map(g => `'${g.trim().toLowerCase()}'`).join(',')})
        `
        : '';

      // Get popular anime items
      const animeGenreFilter = genreJoinAndWhere
        .replace('%TABLE%', 'a')
        .replace('%ID%', 'id_anime')
        .replace('%TYPE%', 'anime');

      const popularAnimes = await this.prisma.$queryRawUnsafe(`
        SELECT ${genre ? 'DISTINCT' : ''}
          a.id_anime as id,
          a.titre,
          a.image,
          'anime' as type,
          a.nice_url as niceUrl,
          a.moyennenotes,
          a.nb_reviews,
          a.annee
        FROM ak_animes a
        ${animeGenreFilter}
        WHERE a.statut = 1
          AND a.id_anime NOT IN (
            SELECT id_anime FROM ak_critique WHERE id_membre = ${id} AND id_anime IS NOT NULL
          )
          AND a.id_anime NOT IN (
            SELECT id_anime FROM collection_animes WHERE id_membre = ${id} AND id_anime IS NOT NULL
          )
        ORDER BY ${animeOrderBy}
        LIMIT ${Math.ceil(remaining / 2)} OFFSET ${offset}
      `);

      // Get popular manga items
      const mangaGenreFilter = genreJoinAndWhere
        .replace('%TABLE%', 'm')
        .replace('%ID%', 'id_manga')
        .replace('%TYPE%', 'manga');

      const popularMangas = await this.prisma.$queryRawUnsafe(`
        SELECT ${genre ? 'DISTINCT' : ''}
          m.id_manga as id,
          m.titre,
          m.image,
          'manga' as type,
          m.nice_url as niceUrl,
          m.moyennenotes,
          m.nb_clics,
          m.annee
        FROM ak_mangas m
        ${mangaGenreFilter}
        WHERE m.statut = 1
          AND m.id_manga NOT IN (
            SELECT id_manga FROM ak_critique WHERE id_membre = ${id} AND id_manga IS NOT NULL
          )
          AND m.id_manga NOT IN (
            SELECT id_manga FROM collection_mangas WHERE id_membre = ${id} AND id_manga IS NOT NULL
          )
        ORDER BY ${mangaOrderBy}
        LIMIT ${Math.ceil(remaining / 2)} OFFSET ${offset}
      `);

      const popularItems = [...(popularAnimes as any[]), ...(popularMangas as any[])]
        .slice(0, remaining);

      recommendations = [
        ...recommendations,
        ...popularItems
      ];
    }

    const finalResults = recommendations.slice(0, limit);

    console.log('✅ Returning recommendations:', {
      totalFound: recommendations.length,
      returning: finalResults.length,
      firstThreeTitles: finalResults.slice(0, 3).map((r: any) => `${r.titre} (${r.type})`)
    });

    return {
      items: finalResults,
      pagination: { page, limit },
    };
  }

  // Public methods (no authentication required)
  async findPublicByPseudo(pseudo: string) {
    const user = await this.prisma.smfMember.findFirst({
      where: {
        OR: [
          { memberName: pseudo },
          { realName: pseudo }
        ]
      },
      select: {
        idMember: true,
        memberName: true,
        realName: true,
        dateRegistered: true,
        lastLogin: true,
        posts: true,
        nbCritiques: true,
        nbSynopsis: true,
        nbContributions: true,
        experience: true,
        idGroup: true,
        avatar: true,
        bannerImage: true,
        personalText: true,
        location: true,
        // Don't include email, password, or other sensitive fields
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return {
      user: this.sanitizePublicUser(user)
    };
  }

  async getPublicUserStats(pseudo: string) {
    const user = await this.prisma.smfMember.findFirst({
      where: {
        OR: [
          { memberName: pseudo },
          { realName: pseudo }
        ]
      },
      select: { idMember: true }
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Get public review stats overall, and by media type
    const reviewStats = await this.prisma.$queryRaw`
      SELECT
        notation as rating,
        COUNT(*) as count
      FROM ak_critique
      WHERE id_membre = ${user.idMember} AND statut = 0
      GROUP BY notation
      ORDER BY notation DESC
    `;

    const reviewStatsAnime = await this.prisma.$queryRaw`
      SELECT
        notation as rating,
        COUNT(*) as count
      FROM ak_critique
      WHERE id_membre = ${user.idMember} AND statut = 0 AND id_anime IS NOT NULL AND id_anime > 0
      GROUP BY notation
      ORDER BY notation DESC
    `;

    const reviewStatsManga = await this.prisma.$queryRaw`
      SELECT
        notation as rating,
        COUNT(*) as count
      FROM ak_critique
      WHERE id_membre = ${user.idMember} AND statut = 0 AND id_manga IS NOT NULL AND id_manga > 0
      GROUP BY notation
      ORDER BY notation DESC
    `;

    // Get total review count
    const totalReviewsResult = await this.prisma.akCritique.count({
      where: {
        idMembre: user.idMember,
        statut: 0  // Only published reviews
      }
    });

    // Top genres overall and by media (based on tags linked to reviewed content)
    const topGenresAll = await this.prisma.$queryRaw`
      SELECT t.tag_name as genre, COUNT(*) as count
      FROM ak_critique c
      LEFT JOIN ak_tag2fiche tf_a ON c.id_anime = tf_a.id_fiche AND tf_a.type = 'anime'
      LEFT JOIN ak_tag2fiche tf_m ON c.id_manga = tf_m.id_fiche AND tf_m.type = 'manga'
      LEFT JOIN ak_tags t ON (tf_a.id_tag = t.id_tag OR tf_m.id_tag = t.id_tag)
      WHERE c.id_membre = ${user.idMember} AND c.statut = 0 AND t.tag_name IS NOT NULL
      GROUP BY t.tag_name
      ORDER BY count DESC, t.tag_name ASC
      LIMIT 12
    `;

    const topGenresAnime = await this.prisma.$queryRaw`
      SELECT t.tag_name as genre, COUNT(*) as count
      FROM ak_critique c
      JOIN ak_tag2fiche tf_a ON c.id_anime = tf_a.id_fiche AND tf_a.type = 'anime'
      JOIN ak_tags t ON tf_a.id_tag = t.id_tag
      WHERE c.id_membre = ${user.idMember} AND c.statut = 0
      GROUP BY t.tag_name
      ORDER BY count DESC, t.tag_name ASC
      LIMIT 12
    `;

    const topGenresManga = await this.prisma.$queryRaw`
      SELECT t.tag_name as genre, COUNT(*) as count
      FROM ak_critique c
      JOIN ak_tag2fiche tf_m ON c.id_manga = tf_m.id_fiche AND tf_m.type = 'manga'
      JOIN ak_tags t ON tf_m.id_tag = t.id_tag
      WHERE c.id_membre = ${user.idMember} AND c.statut = 0
      GROUP BY t.tag_name
      ORDER BY count DESC, t.tag_name ASC
      LIMIT 12
    `;

    // Collection-based tag stats for public profile (only public collection items considered)
    const collectionTagStats = await this.getUserCollectionTagStatsInternal(user.idMember, false, 12);

    // Get forum statistics for public profile
    const userPosts = await this.prisma.smfMember.findUnique({
      where: { idMember: user.idMember },
      select: { posts: true }
    });

    const forumPopularityByMessages = await this.prisma.$queryRaw`
      SELECT
        b.id_board as "boardId",
        b.name as "boardName",
        COUNT(m.id_msg) as "messageCount",
        (COUNT(m.id_msg)::float / NULLIF(${userPosts?.posts || 0}, 0) * 100) as "percentage"
      FROM smf_messages m
      JOIN smf_boards b ON m.id_board = b.id_board
      WHERE m.id_member = ${user.idMember}
      GROUP BY b.id_board, b.name
      ORDER BY "messageCount" DESC
      LIMIT 10
    `;

    const forumPopularityByActivity = await this.prisma.$queryRaw`
      SELECT
        b.id_board as "boardId",
        b.name as "boardName",
        COUNT(m.id_msg) as "userMessageCount",
        b.num_posts as "boardTotalPosts",
        (COUNT(m.id_msg)::float / NULLIF(b.num_posts, 0) * 100) as "activityPercentage"
      FROM smf_messages m
      JOIN smf_boards b ON m.id_board = b.id_board
      WHERE m.id_member = ${user.idMember}
      GROUP BY b.id_board, b.name, b.num_posts
      ORDER BY "activityPercentage" DESC
      LIMIT 10
    `;

    return {
      totalReviews: totalReviewsResult,
      reviewStats: (reviewStats as any[]).map(stat => ({
        rating: stat.rating,
        count: Number(stat.count)
      })),
      reviewStatsAnime: (reviewStatsAnime as any[]).map(stat => ({ rating: stat.rating, count: Number(stat.count) })),
      reviewStatsManga: (reviewStatsManga as any[]).map(stat => ({ rating: stat.rating, count: Number(stat.count) })),
      topGenresAll: (topGenresAll as any[]).map(g => ({ genre: g.genre, count: Number(g.count) })),
      topGenresAnime: (topGenresAnime as any[]).map(g => ({ genre: g.genre, count: Number(g.count) })),
      topGenresManga: (topGenresManga as any[]).map(g => ({ genre: g.genre, count: Number(g.count) })),
      collectionTagStats,
      forumStats: {
        totalPosts: userPosts?.posts || 0,
        popularityByMessages: (forumPopularityByMessages as any[]).map(stat => ({
          boardId: Number(stat.boardId),
          boardName: stat.boardName,
          messageCount: Number(stat.messageCount),
          percentage: stat.percentage ? Number(stat.percentage).toFixed(2) : '0.00'
        })),
        popularityByActivity: (forumPopularityByActivity as any[]).map(stat => ({
          boardId: Number(stat.boardId),
          boardName: stat.boardName,
          userMessageCount: Number(stat.userMessageCount),
          boardTotalPosts: Number(stat.boardTotalPosts),
          activityPercentage: stat.activityPercentage ? Number(stat.activityPercentage).toFixed(2) : '0.00'
        }))
      },
    };
  }

  // Internal helper to compute collection-based tags stats for a user
  private async getUserCollectionTagStatsInternal(userId: number, includePrivate: boolean, limit = 12) {
    // Build visibility condition snippets (constant, not user-supplied)
    const animeVisibility = includePrivate ? '' : 'AND ca.is_public = true';
    const mangaVisibility = includePrivate ? '' : 'AND cm.is_public = true';

    // Combined (anime + manga)
    const combinedSql = `
      SELECT
        t.id_tag,
        t.tag_name,
        t.tag_nice_url,
        t.categorie,
        COUNT(*) AS item_count,
        COALESCE(SUM(c.evaluation), 0) AS sum_rating,
        AVG(NULLIF(c.evaluation, 0)) AS avg_rating
      FROM (
        SELECT ca.id_anime AS item_id, 'anime'::text AS type, ca.evaluation
        FROM collection_animes ca
        WHERE ca.id_membre = $1 ${animeVisibility}
        UNION ALL
        SELECT cm.id_manga AS item_id, 'manga'::text AS type, cm.evaluation
        FROM collection_mangas cm
        WHERE cm.id_membre = $1 ${mangaVisibility}
      ) c
      JOIN ak_tag2fiche tf ON tf.type = c.type AND tf.id_fiche = c.item_id
      JOIN ak_tags t ON t.id_tag = tf.id_tag
      WHERE t.categorie IN ('Genre', 'Thème')
      GROUP BY t.id_tag, t.tag_name, t.tag_nice_url, t.categorie
      ORDER BY sum_rating DESC, item_count DESC, t.tag_name ASC
      LIMIT $2
    `;
    const combined = await this.prisma.$queryRawUnsafe<any[]>(combinedSql, userId, limit);

    // Anime-only
    const animeOnlySql = `
      SELECT
        t.id_tag,
        t.tag_name,
        t.tag_nice_url,
        t.categorie,
        COUNT(*) AS item_count,
        COALESCE(SUM(ca.evaluation), 0) AS sum_rating,
        AVG(NULLIF(ca.evaluation, 0)) AS avg_rating
      FROM collection_animes ca
      JOIN ak_tag2fiche tf ON tf.type = 'anime' AND tf.id_fiche = ca.id_anime
      JOIN ak_tags t ON t.id_tag = tf.id_tag
      WHERE ca.id_membre = $1 ${animeVisibility} AND t.categorie IN ('Genre', 'Thème')
      GROUP BY t.id_tag, t.tag_name, t.tag_nice_url, t.categorie
      ORDER BY sum_rating DESC, item_count DESC, t.tag_name ASC
      LIMIT $2
    `;
    const animeOnly = await this.prisma.$queryRawUnsafe<any[]>(animeOnlySql, userId, limit);

    // Manga-only
    const mangaOnlySql = `
      SELECT
        t.id_tag,
        t.tag_name,
        t.tag_nice_url,
        t.categorie,
        COUNT(*) AS item_count,
        COALESCE(SUM(cm.evaluation), 0) AS sum_rating,
        AVG(NULLIF(cm.evaluation, 0)) AS avg_rating
      FROM collection_mangas cm
      JOIN ak_tag2fiche tf ON tf.type = 'manga' AND tf.id_fiche = cm.id_manga
      JOIN ak_tags t ON t.id_tag = tf.id_tag
      WHERE cm.id_membre = $1 ${mangaVisibility} AND t.categorie IN ('Genre', 'Thème')
      GROUP BY t.id_tag, t.tag_name, t.tag_nice_url, t.categorie
      ORDER BY sum_rating DESC, item_count DESC, t.tag_name ASC
      LIMIT $2
    `;
    const mangaOnly = await this.prisma.$queryRawUnsafe<any[]>(mangaOnlySql, userId, limit);

    const mapRow = (r: any) => ({
      id: Number(r.id_tag),
      name: r.tag_name,
      niceUrl: r.tag_nice_url,
      category: r.categorie,
      count: Number(r.item_count || 0),
      sumRating: Number(r.sum_rating || 0),
      avgRating: r.avg_rating !== null ? Number(r.avg_rating) : null,
    });

    return {
      combinedTop: (combined || []).map(mapRow),
      animeTop: (animeOnly || []).map(mapRow),
      mangaTop: (mangaOnly || []).map(mapRow),
    };
  }

  async getPublicUserReviews(pseudo: string, limit: number = 10) {
    const user = await this.prisma.smfMember.findFirst({
      where: {
        OR: [
          { memberName: pseudo },
          { realName: pseudo }
        ]
      },
      select: { idMember: true, memberName: true, realName: true, avatar: true }
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Get only published reviews (statut = 0)
    const reviews = await this.prisma.$queryRaw`
      SELECT
        c.id_critique as id,
        c.titre,
        c.critique,
        c.notation,
        c.date_critique as reviewDate,
        c.statut,
        c.id_anime as animeId,
        c.id_manga as mangaId,
        c.nb_clics as nbClics,
        COALESCE(a.titre, m.titre) as mediaTitle,
        COALESCE(a.image, m.image) as mediaImage,
        COALESCE(a.nice_url, m.nice_url) as mediaNiceUrl,
        CASE WHEN c.id_anime IS NOT NULL THEN 'anime' ELSE 'manga' END as mediaType
      FROM ak_critique c
      LEFT JOIN ak_animes a ON c.id_anime = a.id_anime
      LEFT JOIN ak_mangas m ON c.id_manga = m.id_manga
      WHERE c.id_membre = ${user.idMember} AND c.statut = 0
      ORDER BY c.date_critique DESC
      LIMIT ${limit}
    `;

    return {
      reviews: (reviews as any[]).map(review => ({
        ...review,
        membre: {
          id: user.idMember,
          pseudo: user.realName || user.memberName,
          avatar: user.avatar
        }
      }))
    };
  }

  async getPublicUserActivity(pseudo: string, limit: number = 10) {
    const user = await this.prisma.smfMember.findFirst({
      where: {
        OR: [
          { memberName: pseudo },
          { realName: pseudo }
        ]
      },
      select: { idMember: true }
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Get public reviews and collection activities
    const recentReviews = await this.prisma.$queryRaw`
      SELECT
        'review' as type,
        c.date_critique as date,
        COALESCE(a.titre, m.titre) as title,
        c.id_critique as id,
        c.nice_url as "reviewSlug",
        CASE
          WHEN c.id_anime IS NOT NULL THEN CONCAT(a.nice_url, '-', a.id_anime)
          WHEN c.id_manga IS NOT NULL THEN CONCAT(m.nice_url, '-', m.id_manga)
          ELSE NULL
        END as "niceUrl",
        CASE
          WHEN c.id_anime IS NOT NULL THEN 'anime'
          WHEN c.id_manga IS NOT NULL THEN 'manga'
          ELSE NULL
        END as "mediaType"
      FROM ak_critique c
      LEFT JOIN ak_animes a ON c.id_anime = a.id_anime
      LEFT JOIN ak_mangas m ON c.id_manga = m.id_manga
      WHERE c.id_membre = ${user.idMember} AND c.statut = 0
      ORDER BY c.date_critique DESC
      LIMIT ${limit}
    `;

    // Get public collection activities
    const recentCollections = await this.prisma.$queryRaw`
      (SELECT
        'anime_added' as type,
        EXTRACT(EPOCH FROM ca.created_at) as date,
        a.titre as title,
        ca.id_anime as id,
        NULL as "reviewSlug",
        CONCAT(a.nice_url, '-', a.id_anime) as "niceUrl",
        'anime' as "mediaType"
      FROM collection_animes ca
      LEFT JOIN ak_animes a ON ca.id_anime = a.id_anime
      WHERE ca.id_membre = ${user.idMember} AND ca.is_public = true
      ORDER BY ca.created_at DESC
      LIMIT ${Math.ceil(limit / 2)})
      UNION ALL
      (SELECT
        'manga_added' as type,
        EXTRACT(EPOCH FROM cm.created_at) as date,
        m.titre as title,
        cm.id_manga as id,
        NULL as "reviewSlug",
        CONCAT(m.nice_url, '-', m.id_manga) as "niceUrl",
        'manga' as "mediaType"
      FROM collection_mangas cm
      LEFT JOIN ak_mangas m ON cm.id_manga = m.id_manga
      WHERE cm.id_membre = ${user.idMember} AND cm.is_public = true
      ORDER BY cm.created_at DESC
      LIMIT ${Math.floor(limit / 2)})
    `;

    const allActivities = [
      ...(recentReviews as any[]),
      ...(recentCollections as any[])
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
     .slice(0, limit);

    const activities = allActivities;

    return {
      activities: activities
    };
  }

  async checkUserActivity(userId: number) {
    // Check if user has any anime in collection
    const animeCount = await this.prisma.collectionAnime.count({
      where: { idMembre: userId }
    });

    // Check if user has any manga in collection
    const mangaCount = await this.prisma.collectionManga.count({
      where: { idMembre: userId }
    });

    // Check if user has any forum posts
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: userId },
      select: { posts: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      hasAnimeInCollection: animeCount > 0,
      hasMangaInCollection: mangaCount > 0,
      hasForumPosts: user.posts > 0
    };
  }

  async getUserBirthdays(month: number, year: number) {
    // Validate month
    if (month < 1 || month > 12) {
      throw new BadRequestException('Le mois doit être entre 1 et 12');
    }

    // Get all users with birthdays in the specified month
    const users = await this.prisma.$queryRaw`
      SELECT
        id_member as "idMember",
        member_name as "memberName",
        real_name as "realName",
        avatar,
        birthdate,
        EXTRACT(DAY FROM birthdate) as day
      FROM smf_members
      WHERE birthdate IS NOT NULL
        AND EXTRACT(MONTH FROM birthdate) = ${month}
      ORDER BY EXTRACT(DAY FROM birthdate), member_name
    `;

    // Calculate age and format response
    const birthdays = (users as any[]).map(user => {
      const birthDate = new Date(user.birthdate);
      const currentYear = year;
      const birthYear = birthDate.getFullYear();

      // Calculate age (will be their age on this birthday in the given year)
      let age = currentYear - birthYear;

      return {
        id: user.idMember,
        pseudo: user.realName || user.memberName,
        memberName: user.memberName,
        avatar: user.avatar,
        birthdate: user.birthdate,
        day: Number(user.day),
        age: age
      };
    });

    // Group by day
    const birthdaysByDay: { [key: number]: any[] } = {};
    birthdays.forEach(birthday => {
      if (!birthdaysByDay[birthday.day]) {
        birthdaysByDay[birthday.day] = [];
      }
      birthdaysByDay[birthday.day].push(birthday);
    });

    return {
      month,
      year,
      birthdays: birthdaysByDay,
      total: birthdays.length
    };
  }

  private decodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  private sanitizeUser(user: any) {
    // Remove sensitive fields and format response
    const {
      idMember,
      memberName,
      realName,
      emailAddress,
      dateRegistered,
      lastLogin,
      ...otherFields
    } = user;

    const sanitized: any = {
      id: idMember,
      username: memberName,
      realName,
      registrationDate: dateRegistered,
      lastLogin,
      groupId: user.idGroup,
      role: getRoleName(user.idGroup),
      isAdmin: hasAdminAccess(user.idGroup) || idMember === 1,
      ...otherFields,
    };

    // Decode HTML entities in text fields
    if (sanitized.personalText) {
      sanitized.personalText = this.decodeHtmlEntities(sanitized.personalText);
    }
    if (sanitized.location) {
      sanitized.location = this.decodeHtmlEntities(sanitized.location);
    }

    if (emailAddress !== undefined) {
      sanitized.email = emailAddress;
    }

    return sanitized;
  }

  private sanitizePublicUser(user: any) {
    // Format public user data (no sensitive info)
    const {
      idMember,
      memberName,
      realName,
      dateRegistered,
      lastLogin,
      posts,
      ...otherFields
    } = user;

    const publicUser = {
      id: idMember,
      pseudo: realName || memberName,
      username: memberName,
      dateInscription: dateRegistered,
      lastLogin,
      nbPost: posts,
      reputation: otherFields.experience || 0,
      ...otherFields,
    };

    // Decode HTML entities in text fields
    if (publicUser.personalText) {
      publicUser.personalText = this.decodeHtmlEntities(publicUser.personalText);
    }
    if (publicUser.location) {
      publicUser.location = this.decodeHtmlEntities(publicUser.location);
    }

    return publicUser;
  }
}
