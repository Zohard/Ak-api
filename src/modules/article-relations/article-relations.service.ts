import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateArticleRelationDto } from './dto/article-relation.dto';

@Injectable()
export class ArticleRelationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all anime/manga/business related to an article
   */
  async getArticleRelations(idWpArticle: number) {
    const relations = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idWpArticle: BigInt(idWpArticle),
      },
    });

    // Fetch titles separately based on type to avoid foreign key issues
    const results = await Promise.all(
      relations.map(async (rel) => {
        let ficheTitle = 'Unknown';

        try {
          if (rel.type === 'anime') {
            const anime = await this.prisma.akAnime.findUnique({
              where: { idAnime: rel.idFiche },
              select: { titre: true },
            });
            ficheTitle = anime?.titre || 'Unknown';
          } else if (rel.type === 'manga') {
            const manga = await this.prisma.akManga.findUnique({
              where: { idManga: rel.idFiche },
              select: { titre: true },
            });
            ficheTitle = manga?.titre || 'Unknown';
          } else if (rel.type === 'business') {
            const business = await this.prisma.akBusiness.findUnique({
              where: { idBusiness: rel.idFiche },
              select: { denomination: true },
            });
            ficheTitle = business?.denomination || 'Unknown';
          }
        } catch (error) {
          console.error(`Error fetching title for ${rel.type} ${rel.idFiche}:`, error);
        }

        return {
          idRelation: rel.idRelation,
          idFiche: rel.idFiche,
          type: rel.type,
          ficheTitle,
        };
      }),
    );

    return results;
  }

  /**
   * Get all articles related to an anime/manga/business
   */
  async getRelations(idFiche: number, type: 'anime' | 'manga' | 'business') {
    const relations = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idFiche,
        type,
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            postTitle: true,
            postName: true,
            postDate: true,
            postExcerpt: true,
            postStatus: true,
            postContent: true,
          },
        },
      },
      orderBy: {
        wpPost: {
          postDate: 'desc',
        },
      },
    });

    // Filter only published articles
    const publishedRelations = relations.filter(
      (rel) => rel.wpPost?.postStatus === 'publish',
    );

    return publishedRelations.map((rel) => ({
      idRelation: rel.idRelation,
      article: {
        id: Number(rel.wpPost.ID),
        title: rel.wpPost.postTitle,
        slug: rel.wpPost.postName,
        date: rel.wpPost.postDate,
        excerpt: rel.wpPost.postExcerpt,
        content: rel.wpPost.postContent,
      },
    }));
  }

  /**
   * Add a new article relation
   */
  async createRelation(dto: CreateArticleRelationDto) {
    // Check for duplicate
    const existing = await this.prisma.akWebzineToFiches.findFirst({
      where: {
        idFiche: dto.idFiche,
        idWpArticle: dto.idWpArticle,
        type: dto.type,
      },
    });

    if (existing) {
      throw new ConflictException('Cette relation existe déjà');
    }

    // Verify the WordPress article exists and is published
    const wpPost = await this.prisma.wpPost.findUnique({
      where: { ID: dto.idWpArticle },
    });

    if (!wpPost) {
      throw new NotFoundException(
        `Article WordPress avec ID ${dto.idWpArticle} introuvable`,
      );
    }

    // Verify the target entity exists
    await this.verifyEntityExists(dto.idFiche, dto.type);

    // Create relation
    const relation = await this.prisma.akWebzineToFiches.create({
      data: {
        idFiche: dto.idFiche,
        idWpArticle: dto.idWpArticle,
        idArticle: 0, // Legacy field, set to 0 for new WordPress-only relations
        type: dto.type,
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            postTitle: true,
            postName: true,
            postDate: true,
          },
        },
      },
    });

    // Update modification date based on type
    await this.updateModificationDate(dto.idFiche, dto.type);

    return {
      success: true,
      message: 'Relation créée avec succès',
      data: {
        idRelation: relation.idRelation,
        article: {
          id: Number(relation.wpPost.ID),
          title: relation.wpPost.postTitle,
          slug: relation.wpPost.postName,
          date: relation.wpPost.postDate,
        },
      },
    };
  }

  /**
   * Remove an article relation
   */
  async deleteRelation(idRelation: number, type?: 'anime' | 'manga' | 'business') {
    const relation = await this.prisma.akWebzineToFiches.findUnique({
      where: { idRelation },
    });

    if (!relation) {
      throw new NotFoundException('Relation introuvable');
    }

    await this.prisma.akWebzineToFiches.delete({
      where: { idRelation },
    });

    // Update modification date if type is provided
    if (type || relation.type) {
      const relationType = (type || relation.type) as 'anime' | 'manga' | 'business';
      await this.updateModificationDate(relation.idFiche, relationType);
    }

    return {
      success: true,
      message: 'Relation supprimée avec succès',
    };
  }

  /**
   * Verify that the target entity (anime/manga/business) exists
   */
  private async verifyEntityExists(
    idFiche: number,
    type: 'anime' | 'manga' | 'business',
  ) {
    let entity;

    switch (type) {
      case 'anime':
        entity = await this.prisma.akAnime.findUnique({
          where: { idAnime: idFiche },
        });
        break;
      case 'manga':
        entity = await this.prisma.akManga.findUnique({
          where: { idManga: idFiche },
        });
        break;
      case 'business':
        entity = await this.prisma.akBusiness.findUnique({
          where: { idBusiness: idFiche },
        });
        break;
      default:
        throw new BadRequestException(`Type invalide: ${type}`);
    }

    if (!entity) {
      throw new NotFoundException(
        `${type.charAt(0).toUpperCase() + type.slice(1)} avec ID ${idFiche} introuvable`,
      );
    }
  }

  /**
   * Update the modification date of the related entity
   */
  private async updateModificationDate(
    idFiche: number,
    type: 'anime' | 'manga' | 'business',
  ) {
    const now = new Date();

    try {
      switch (type) {
        case 'anime':
          await this.prisma.akAnime.update({
            where: { idAnime: idFiche },
            data: { dateAjout: now },
          });
          break;
        case 'manga':
          await this.prisma.akManga.update({
            where: { idManga: idFiche },
            data: { dateModification: Math.floor(now.getTime() / 1000) },
          });
          break;
        case 'business':
          await this.prisma.akBusiness.update({
            where: { idBusiness: idFiche },
            data: { dateModification: Math.floor(now.getTime() / 1000) },
          });
          break;
      }
    } catch (error) {
      // Log error but don't throw - updating modification date is not critical
      console.warn(
        `Failed to update modification date for ${type} ${idFiche}:`,
        error,
      );
    }
  }
}
