import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
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
          personalText: true,
          location: true,
          // Don't include password fields
        },
      }),
      this.prisma.smfMember.count({ where }),
    ]);

    return {
      users: users.map(this.sanitizeUser),
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

    // Handle other fields
    Object.entries(otherFields).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = value;
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
    if (user.idGroup === 1 && !isAdmin) {
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

    // Get reviews count and average rating
    const reviewStats = await this.prisma.akCritique.aggregate({
      where: { idMembre: id },
      _count: true,
      _avg: { notation: true },
    });

    // Get anime collection count (using raw SQL since collection tables aren't in Prisma schema)
    let animeCount = 0;
    try {
      const animeCollectionResult = await this.prisma.$queryRaw`
        SELECT COUNT(*) as total FROM collection_animes WHERE id_membre = ${id}
      `;
      animeCount = Number((animeCollectionResult as any)[0]?.total || 0);
    } catch (error) {
      console.log('Error fetching anime collection count:', error);
    }

    // Get manga collection count
    let mangaCount = 0;
    try {
      const mangaCollectionResult = await this.prisma.$queryRaw`
        SELECT COUNT(*) as total FROM collection_mangas WHERE id_membre = ${id}
      `;
      mangaCount = Number((mangaCollectionResult as any)[0]?.total || 0);
    } catch (error) {
      console.log('Error fetching manga collection count:', error);
    }

    // Get genre statistics from reviews (using tags system)
    const genreStats = await this.prisma.$queryRaw`
      SELECT 
        COALESCE(t.tag_name, 'Non spécifié') as name,
        COUNT(*) as count
      FROM ak_critique c
      LEFT JOIN ak_tag2fiche tf_a ON c.id_anime = tf_a.id_fiche AND tf_a.type = 'anime'
      LEFT JOIN ak_tag2fiche tf_m ON c.id_manga = tf_m.id_fiche AND tf_m.type = 'manga'
      LEFT JOIN ak_tags t ON (tf_a.id_tag = t.id_tag OR tf_m.id_tag = t.id_tag)
      WHERE c.id_membre = ${id} AND t.tag_name IS NOT NULL
      GROUP BY t.tag_name
      ORDER BY count DESC
      LIMIT 10
    `;

    // Get rating distribution
    const ratingStats = await this.prisma.$queryRaw`
      SELECT 
        notation as rating,
        COUNT(*) as count
      FROM ak_critique 
      WHERE id_membre = ${id}
      GROUP BY notation 
      ORDER BY notation DESC
    `;

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
        c.date_critique as date,
        COALESCE(a.titre, m.titre) as title,
        c.id_critique as id
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
        now() as date,
        a.titre as title,
        ac.id_anime as id
      FROM collection_animes ac
      LEFT JOIN ak_animes a ON ac.id_anime = a.id_anime
      WHERE ac.id_membre = ${id}
      ORDER BY ac.id_collection DESC
      LIMIT ${Math.ceil(limit / 2)})
      UNION ALL
      (SELECT 
        'manga_added' as type,
        now() as date,
        m.titre as title,
        mc.id_manga as id
      FROM collection_mangas mc
      LEFT JOIN ak_mangas m ON mc.id_manga = m.id_manga
      WHERE mc.id_membre = ${id}
      ORDER BY mc.id_collection DESC
      LIMIT ${Math.floor(limit / 2)})
    `;

    const allActivities = [
      ...(recentReviews as any[]),
      ...(recentCollections as any[])
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    return {
      activities: allActivities
    };
  }

  async getUserRecommendations(id: number, limit: number = 12) {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: id },
      select: { idMember: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Get user's most reviewed content to find preferences (using tags system)
    const userGenres = await this.prisma.$queryRaw`
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
    `;

    let recommendations: any[] = [];

    if ((userGenres as any[]).length > 0) {
      const topGenres = (userGenres as any[]).map(g => g.genre);
      
      // Get anime recommendations based on favorite genres (using tags system)
      const animeRecs = await this.prisma.$queryRaw`
        SELECT DISTINCT
          a.id_anime as id,
          a.titre,
          a.image,
          'anime' as type,
          a.nice_url as niceUrl
        FROM ak_animes a
        JOIN ak_tag2fiche tf ON a.id_anime = tf.id_fiche AND tf.type = 'anime'
        JOIN ak_tags t ON tf.id_tag = t.id_tag
        WHERE t.tag_name = ANY(${topGenres}) 
          AND a.statut = 1 
          AND a.id_anime NOT IN (
            SELECT id_anime FROM ak_critique WHERE id_membre = ${id} AND id_anime IS NOT NULL
          )
        ORDER BY RANDOM()
        LIMIT ${Math.ceil(limit / 2)}
      `;

      // Get manga recommendations based on favorite genres (using tags system)
      const mangaRecs = await this.prisma.$queryRaw`
        SELECT DISTINCT
          m.id_manga as id,
          m.titre,
          m.image,
          'manga' as type,
          m.nice_url as niceUrl
        FROM ak_mangas m
        JOIN ak_tag2fiche tf ON m.id_manga = tf.id_fiche AND tf.type = 'manga'
        JOIN ak_tags t ON tf.id_tag = t.id_tag
        WHERE t.tag_name = ANY(${topGenres}) 
          AND m.statut = 1 
          AND m.id_manga NOT IN (
            SELECT id_manga FROM ak_critique WHERE id_membre = ${id} AND id_manga IS NOT NULL
          )
        ORDER BY RANDOM()
        LIMIT ${Math.floor(limit / 2)}
      `;

      recommendations = [
        ...(animeRecs as any[]),
        ...(mangaRecs as any[])
      ];
    }

    // If not enough recommendations, add popular items
    if (recommendations.length < limit) {
      const remaining = limit - recommendations.length;
      
      // Get popular anime items
      const popularAnimes = await this.prisma.$queryRaw`
        SELECT 
          id_anime as id,
          titre,
          image,
          'anime' as type,
          nice_url as niceUrl
        FROM ak_animes 
        WHERE statut = 1 
        ORDER BY moyennenotes DESC, id_anime DESC
        LIMIT ${Math.ceil(remaining / 2)}
      `;
      
      // Get popular manga items
      const popularMangas = await this.prisma.$queryRaw`
        SELECT 
          id_manga as id,
          titre,
          image,
          'manga' as type,
          nice_url as niceUrl
        FROM ak_mangas 
        WHERE statut = 1 
        ORDER BY moyennenotes DESC, id_manga DESC
        LIMIT ${Math.ceil(remaining / 2)}
      `;
      
      const popularItems = [...(popularAnimes as any[]), ...(popularMangas as any[])]
        .sort(() => Math.random() - 0.5) // Shuffle the combined results
        .slice(0, remaining);

      recommendations = [
        ...recommendations,
        ...popularItems
      ];
    }

    return {
      items: recommendations.slice(0, limit)
    };
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
      isAdmin: user.idGroup === 1 || idMember === 1,
      ...otherFields,
    };

    if (emailAddress !== undefined) {
      sanitized.email = emailAddress;
    }

    return sanitized;
  }
}
