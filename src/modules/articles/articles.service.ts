import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleQueryDto } from './dto/article-query.dto';
import { PublishArticleDto } from './dto/publish-article.dto';

@Injectable()
export class ArticlesService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  private serializeBigInt(obj: any): any {
    return JSON.parse(JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
  }

  private createCacheKey(query: ArticleQueryDto): string {
    const {
      page = 1,
      limit = 20,
      search = '',
      categoryId = '',
      authorId = '',
      status = '',
      sort = '',
      sortBy = '',
      order = '',
      sortOrder = '',
      onindex = '',
      tag = '',
      includeContent = false,
    } = query;

    const key = `${page}_${limit}_${search}_${categoryId}_${authorId}_${status}_${sort}_${sortBy}_${order}_${sortOrder}_${onindex}_${tag}_${includeContent}`;
    
    // Simple hash to keep key length manageable
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async findAll(query: ArticleQueryDto) {
    // Create cache key from query parameters
    const cacheKey = this.createCacheKey(query);
    
    // Try to get from cache first
    const cached = await this.cacheService.getArticlesList(cacheKey);
    if (cached) {
      return cached;
    }

    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      authorId,
      status,
      sort,
      sortBy,
      order = 'desc',
      sortOrder,
      onindex,
      tag,
      includeContent,
    } = query;
    
    // Handle alias parameters
    const finalSort = sortBy || sort || 'postDate';
    const finalOrder = (sortOrder || order || 'desc').toLowerCase();
    const offset = (page - 1) * limit;

    // Build where conditions
    const where: any = {
      postType: 'post', // Only get posts, not pages
    };

    // Status filter
    if (status === 'published') {
      where.postStatus = 'publish';
    } else if (status === 'draft') {
      where.postStatus = 'draft';
    } else if (status === 'archived') {
      where.postStatus = 'trash';
    } else {
      // Default to published posts for public
      where.postStatus = 'publish';
    }

    // Featured articles filter (onindex)
    if (onindex) {
      // For featured articles, we'll use the most recent published posts
      // You can modify this logic based on your specific featured criteria
      where.postStatus = 'publish';
      where.postType = 'post';
    }

    // Search filter
    if (search) {
      where.OR = [
        { postTitle: { contains: search, mode: 'insensitive' } },
        { postContent: { contains: search, mode: 'insensitive' } },
        { postExcerpt: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Author filter
    if (authorId) {
      where.postAuthor = authorId;
    }

    // Category filter (using WordPress taxonomy)
    if (categoryId) {
      where.termRelationships = {
        some: {
          termTaxonomy: {
            taxonomy: 'category',
            termId: categoryId,
          },
        },
      };
    }

    // Sort configuration
    const orderBy: any = {};
    switch (finalSort) {
      case 'title':
      case 'titre':
      case 'postTitle':
        orderBy.postTitle = finalOrder;
        break;
      case 'modified':
      case 'postModified':
        orderBy.postModified = finalOrder;
        break;
      case 'comments':
      case 'commentCount':
      case 'nbCom':
        orderBy.commentCount = finalOrder;
        break;
      case 'views':
      case 'nbClics':
        // For views/clicks, we'll sort by ID as a proxy since we don't have real view counts yet
        orderBy.ID = finalOrder;
        break;
      case 'date':
      case 'postDate':
      default:
        orderBy.postDate = finalOrder;
    }

    // Execute query
    const [posts, total] = await Promise.all([
      this.prisma.wpPost.findMany({
        where,
        include: {
          // Only load category relationships to reduce joins
          termRelationships: {
            where: {
              termTaxonomy: {
                taxonomy: 'category',
              },
            },
            include: {
              termTaxonomy: {
                include: {
                  term: {
                    select: {
                      termId: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
            take: 5, // Limit categories to reduce data transfer
          },
          // Only load essential meta fields
          postMeta: {
            where: {
              OR: [
                { metaKey: '_thumbnail_id' },
                { metaKey: 'ak_img' },
                { metaKey: 'img' },
                { metaKey: 'views' },
              ],
            },
            take: 10, // Limit meta fields
          },
          // Simplified comment count
          _count: {
            select: {
              comments: {
                where: { commentApproved: '1' }
              },
            },
          },
        },
        // Optimize selected fields
        select: {
          ID: true,
          postTitle: true,
          postName: true,
          postDate: true,
          postModified: true,
          postExcerpt: true,
          postAuthor: true,
          postStatus: true,
          commentCount: true,
          postContent: includeContent,
          termRelationships: true,
          postMeta: true,
          _count: true,
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      this.prisma.wpPost.count({ where }),
    ]);

    // Transform results to match Article interface
    const transformedArticles = posts.map((post) => {
      // Extract meta values
      const thumbnailMeta = post.postMeta.find(meta => meta.metaKey === '_thumbnail_id');
      const excerptMeta = post.postMeta.find(meta => meta.metaKey === 'excerpt');
      const viewsMeta = post.postMeta.find(meta => meta.metaKey === 'views');
      const imgMeta = post.postMeta.find(meta => meta.metaKey === 'img');
      const akImgMeta = post.postMeta.find(meta => meta.metaKey === 'ak_img');

      // Extract categories (filter for category taxonomy only)
      const categories = post.termRelationships
        .filter(rel => rel.termTaxonomy.taxonomy === 'category')
        .map(rel => ({
          id: rel.termTaxonomy.term.termId,
          idCat: rel.termTaxonomy.term.termId,
          name: rel.termTaxonomy.term.name,
          nom: rel.termTaxonomy.term.name,
          slug: rel.termTaxonomy.term.slug,
          niceUrl: rel.termTaxonomy.term.slug,
        }));

      // Get the best image URL (prioritize ak_img, then img, then thumbnail)
      const imageUrl = akImgMeta?.metaValue || imgMeta?.metaValue || thumbnailMeta?.metaValue;

      return {
        idArt: Number(post.ID),
        ID: Number(post.ID),
        titre: post.postTitle,
        postTitle: post.postTitle,
        niceUrl: post.postName,
        postName: post.postName,
        date: post.postDate.toISOString(),
        postDate: post.postDate.toISOString(),
        img: imageUrl,
        imgunebig: null, // WordPress doesn't have this concept by default
        imgunebig2: null,
        auteur: post.postAuthor,
        postAuthor: post.postAuthor,
        metaDescription: excerptMeta?.metaValue || post.postExcerpt,
        postExcerpt: post.postExcerpt,
        tags: null, // Will be populated separately if needed
        nbCom: Number(post.commentCount),
        commentCount: Number(post.commentCount),
        nbClics: viewsMeta ? parseInt(viewsMeta.metaValue || '0') : 0,
        statut: post.postStatus === 'publish' ? 1 : 0,
        postStatus: post.postStatus,
        author: {
          idMember: post.postAuthor,
          memberName: `User ${post.postAuthor}`,
          realName: `User ${post.postAuthor}`,
        },
        categories,
        content: includeContent ? post.postContent : undefined,
        contenu: includeContent ? post.postContent : undefined,
        postContent: includeContent ? post.postContent : undefined,
        texte: includeContent ? post.postContent : (post.postExcerpt || '').substring(0, 200),
        imageCount: 0, // TODO: Count images in content if needed
        _count: undefined,
      };
    });

    const totalPages = Math.ceil(total / limit);

    const result = this.serializeBigInt({
      articles: transformedArticles,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });

    // Cache the result (TTL based on query type)
    const ttl = search || categoryId || authorId ? 300 : 600; // 5 mins for filtered, 10 mins for general lists
    await this.cacheService.setArticlesList(cacheKey, result, ttl);

    return result;
  }

  async getById(id: number, includeContent: boolean = true) {
    // Check cache first
    const cached = await this.cacheService.getArticle(id);
    if (cached) {
      return cached;
    }

    const post = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(id) },
      include: {
        author: {
          select: {
            idMember: true,
            memberName: true,
            realName: true,
          },
        },
        termRelationships: {
          include: {
            termTaxonomy: {
              include: {
                term: true,
              },
            },
          },
          where: {
            termTaxonomy: {
              taxonomy: 'category',
            },
          },
        },
        comments: {
          where: { commentApproved: '1' },
          orderBy: { commentDate: 'asc' },
        },
        postMeta: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Article not found');
    }

    // Increment view count
    await this.incrementViewCount(id);

    const result = this.transformPost(post, includeContent);
    
    // Cache the result for 30 minutes
    await this.cacheService.setArticle(id, result, 1800);

    return result;
  }

  async getByNiceUrl(niceUrl: string, includeContent: boolean = true) {
    console.log('ArticlesService.getByNiceUrl called with:', niceUrl);
    
    // Check cache first
    const cached = await this.cacheService.getArticleBySlug(niceUrl);
    if (cached) {
      return cached;
    }

    const post = await this.prisma.wpPost.findFirst({
      where: { 
        postName: niceUrl,
        postType: 'post',
        postStatus: 'publish'
      },
      include: {
        author: {
          select: {
            idMember: true,
            memberName: true,
            realName: true,
          },
        },
        termRelationships: {
          include: {
            termTaxonomy: {
              include: {
                term: true,
              },
            },
          },
          where: {
            termTaxonomy: {
              taxonomy: 'category',
            },
          },
        },
        comments: {
          where: { commentApproved: '1' },
          orderBy: { commentDate: 'asc' },
        },
        postMeta: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Article not found');
    }

    // Increment view count
    await this.incrementViewCount(Number(post.ID));

    const result = this.transformPost(post, includeContent);
    
    // Cache the result for 30 minutes
    await this.cacheService.setArticleBySlug(niceUrl, result, 1800);

    return result;
  }

  async getFeaturedArticles(limit: number = 5) {
    // Check cache first
    const cached = await this.cacheService.getFeaturedArticles();
    if (cached) {
      return cached;
    }

    // Get posts with a specific meta key indicating they're featured
    const posts = await this.prisma.wpPost.findMany({
      where: {
        postType: 'post',
        postStatus: 'publish',
        postMeta: {
          some: {
            metaKey: 'featured_post',
            metaValue: '1',
          },
        },
      },
      include: {
        author: {
          select: {
            idMember: true,
            memberName: true,
            realName: true,
          },
        },
        termRelationships: {
          include: {
            termTaxonomy: {
              include: {
                term: true,
              },
            },
          },
          where: {
            termTaxonomy: {
              taxonomy: 'category',
            },
          },
        },
        postMeta: true,
        _count: {
          select: {
            comments: {
              where: { commentApproved: '1' }
            },
          },
        },
      },
      orderBy: { postDate: 'desc' },
      take: limit,
    });

    const result = posts.map(post => this.transformPost(post, false));
    
    // Cache the featured articles for 1 hour
    await this.cacheService.setFeaturedArticles(result, 3600);

    return result;
  }

  async create(articleData: CreateArticleDto, authorId: number): Promise<any> {
    // Generate nice URL if not provided
    const postName =
      articleData.niceUrl || this.generateNiceUrl(articleData.titre);

    // Ensure URL uniqueness
    const existingArticle = await this.prisma.wpPost.findFirst({
      where: { postName },
    });

    if (existingArticle) {
      throw new BadRequestException('An article with this URL already exists');
    }

    // Create WordPress post
    const createData = {
      postTitle: articleData.titre,
      postName: postName,
      postContent: articleData.texte || '',
      postExcerpt: articleData.metaDescription || '',
      postStatus: 'draft',
      postType: 'post',
      postDate: new Date(),
      postDateGmt: new Date(),
      postModified: new Date(),
      postModifiedGmt: new Date(),
      postAuthor: authorId,
      commentStatus: 'open',
      pingStatus: 'open',
      postPassword: '',
      postContentFiltered: '',
      guid: `http://localhost:3003/?p=${Date.now()}`,
      menuOrder: 0,
      commentCount: 0,
    };

    const article = await this.prisma.wpPost.create({
      data: createData,
      include: {
        author: {
          select: {
            idMember: true,
            memberName: true,
            realName: true,
          },
        },
        comments: {
          where: { commentApproved: '1' },
        },
        postMeta: true,
      },
    });

    return this.transformPost(article, true);
  }

  async update(
    id: number,
    updateData: UpdateArticleDto,
    authorId: number,
    isAdmin: boolean,
  ): Promise<any> {
    const existingArticle = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(id) },
    });

    if (!existingArticle) {
      throw new NotFoundException('Article not found');
    }

    // Check permissions
    if (!isAdmin && Number(existingArticle.postAuthor) !== authorId) {
      throw new ForbiddenException(
        'You can only edit your own articles',
      );
    }

    // Prepare update data
    const updatePayload: any = {
      postModified: new Date(),
      postModifiedGmt: new Date(),
    };

    if (updateData.titre) updatePayload.postTitle = updateData.titre;
    if (updateData.texte) updatePayload.postContent = updateData.texte;
    if (updateData.metaDescription) updatePayload.postExcerpt = updateData.metaDescription;
    if (updateData.niceUrl) updatePayload.postName = updateData.niceUrl;

    const updatedArticle = await this.prisma.wpPost.update({
      where: { ID: BigInt(id) },
      data: updatePayload,
      include: {
        author: {
          select: {
            idMember: true,
            memberName: true,
            realName: true,
          },
        },
        termRelationships: {
          include: {
            termTaxonomy: {
              include: {
                term: true,
              },
            },
          },
        },
        comments: {
          where: { commentApproved: '1' },
        },
        postMeta: true,
      },
    });

    return this.transformPost(updatedArticle, true);
  }

  async publish(
    id: number,
    publishData: PublishArticleDto,
    authorId: number,
    isAdmin: boolean,
  ): Promise<any> {
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(id) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Check permissions - only admins or article authors can publish
    if (!isAdmin && Number(article.postAuthor) !== authorId) {
      throw new ForbiddenException(
        'You can only publish your own articles',
      );
    }

    await this.prisma.wpPost.update({
      where: { ID: BigInt(id) },
      data: {
        postStatus: publishData.publish ? 'publish' : 'draft',
        postModified: new Date(),
        postModifiedGmt: new Date(),
      },
    });

    return {
      message: `Article ${publishData.publish ? 'published' : 'unpublished'} successfully`,
    };
  }

  async remove(id: number, authorId: number, isAdmin: boolean): Promise<any> {
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(id) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Only admins can delete articles
    if (!isAdmin) {
      throw new ForbiddenException('Only administrators can delete articles');
    }

    await this.prisma.wpPost.delete({
      where: { ID: BigInt(id) },
    });

    return { message: 'Article deleted successfully' };
  }

  async getStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM wp_posts WHERE post_status = 'publish' AND post_type = 'post') as published_articles,
        (SELECT COUNT(*) FROM wp_posts WHERE post_status = 'draft' AND post_type = 'post') as draft_articles,
        (SELECT COUNT(*) FROM wp_posts WHERE post_status = 'trash' AND post_type = 'post') as archived_articles,
        (SELECT COUNT(*) FROM wp_comments WHERE comment_approved = '1') as approved_comments,
        (SELECT COUNT(*) FROM wp_comments WHERE comment_approved = '0') as pending_comments,
        (SELECT COUNT(*) FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id WHERE tt.taxonomy = 'category') as categories_count,
        (SELECT COUNT(*) FROM wp_postmeta WHERE meta_key = 'featured_post' AND meta_value = '1') as featured_articles
    `;

    const result = (stats as any[])[0];

    return {
      published_articles: Number(result.published_articles),
      draft_articles: Number(result.draft_articles),
      archived_articles: Number(result.archived_articles),
      approved_comments: Number(result.approved_comments),
      pending_comments: Number(result.pending_comments),
      categories_count: Number(result.categories_count),
      featured_articles: Number(result.featured_articles),
    };
  }

  async featureArticle(id: number, order?: number): Promise<any> {
    // Delete existing featured meta and create new one
    await this.prisma.wpPostMeta.deleteMany({
      where: {
        postId: BigInt(id),
        metaKey: 'featured_post',
      },
    });

    await this.prisma.wpPostMeta.create({
      data: {
        postId: BigInt(id),
        metaKey: 'featured_post',
        metaValue: '1',
      },
    });

    if (order !== undefined) {
      await this.prisma.wpPostMeta.deleteMany({
        where: {
          postId: BigInt(id),
          metaKey: 'featured_order',
        },
      });

      await this.prisma.wpPostMeta.create({
        data: {
          postId: BigInt(id),
          metaKey: 'featured_order',
          metaValue: order.toString(),
        },
      });
    }

    return { message: 'Article featured successfully' };
  }

  async unfeatureArticle(id: number): Promise<any> {
    await this.prisma.wpPostMeta.deleteMany({
      where: {
        postId: BigInt(id),
        metaKey: {
          in: ['featured_post', 'featured_order'],
        },
      },
    });

    return { message: 'Article unfeatured successfully' };
  }

  async reorderFeaturedArticles(
    articles: Array<{ articleId: number; order: number }>,
  ): Promise<any> {
    for (const article of articles) {
      await this.prisma.wpPostMeta.deleteMany({
        where: {
          postId: BigInt(article.articleId),
          metaKey: 'featured_order',
        },
      });

      await this.prisma.wpPostMeta.create({
        data: {
          postId: BigInt(article.articleId),
          metaKey: 'featured_order',
          metaValue: article.order.toString(),
        },
      });
    }

    return { message: 'Featured articles reordered successfully' };
  }

  private transformPost(post: any, includeContent: boolean = true) {
    // Extract meta values
    const thumbnailMeta = post.postMeta?.find(meta => meta.metaKey === '_thumbnail_id');
    const excerptMeta = post.postMeta?.find(meta => meta.metaKey === 'excerpt');
    const viewsMeta = post.postMeta?.find(meta => meta.metaKey === 'views');
    const imgMeta = post.postMeta?.find(meta => meta.metaKey === 'img');
    const akImgMeta = post.postMeta?.find(meta => meta.metaKey === 'ak_img');
    const imgunebigMeta = post.postMeta?.find(meta => meta.metaKey === 'imgunebig');
    const tagsMeta = post.postMeta?.find(meta => meta.metaKey === 'tags');

    // Extract categories
    const categories = post.termRelationships?.map(rel => ({
      id: rel.termTaxonomy.term.termId,
      idCat: rel.termTaxonomy.term.termId,
      name: rel.termTaxonomy.term.name,
      nom: rel.termTaxonomy.term.name,
      slug: rel.termTaxonomy.term.slug,
      niceUrl: rel.termTaxonomy.term.slug,
    })) || [];

    // Transform comments
    const comments = post.comments?.map(comment => ({
      id: Number(comment.commentID),
      id_article: Number(post.ID),
      id_membre: Number(comment.userId),
      nom: comment.commentAuthor || 'Anonymous',
      commentaire: comment.commentContent || '',
      date: comment.commentDate.toISOString(),
      moderation: comment.commentApproved === '1' ? 1 : 0,
      author: null, // TODO: Join with member if userId > 0
    })) || [];

    return {
      idArt: Number(post.ID),
      ID: post.ID,
      titre: post.postTitle,
      postTitle: post.postTitle,
      niceUrl: post.postName,
      postName: post.postName,
      date: post.postDate.toISOString(),
      postDate: post.postDate.toISOString(),
      img: this.transformImageUrl(akImgMeta?.metaValue || imgMeta?.metaValue || thumbnailMeta?.metaValue),
      imgunebig: imgunebigMeta?.metaValue || null,
      imgunebig2: null,
      auteur: post.postAuthor,
      postAuthor: post.postAuthor,
      metaDescription: excerptMeta?.metaValue || post.postExcerpt,
      postExcerpt: post.postExcerpt,
      tags: tagsMeta?.metaValue || null,
      nbCom: Number(post.commentCount || post._count?.comments || 0),
      commentCount: Number(post.commentCount || post._count?.comments || 0),
      nbClics: viewsMeta ? parseInt(viewsMeta.metaValue || '0') : 0,
      statut: post.postStatus === 'publish' ? 1 : 0,
      postStatus: post.postStatus,
      author: {
        idMember: post.author.idMember,
        memberName: post.author.memberName,
        realName: post.author.realName,
      },
      categories,
      comments,
      content: includeContent ? post.postContent : undefined,
      contenu: includeContent ? post.postContent : undefined,
      postContent: includeContent ? post.postContent : undefined,
      texte: includeContent ? post.postContent : (post.postExcerpt || '').substring(0, 200),
      imageCount: 0, // TODO: Count images in content if needed
    };
  }

  private async incrementViewCount(articleId: number) {
    // Update or create views meta
    const existingMeta = await this.prisma.wpPostMeta.findFirst({
      where: {
        postId: BigInt(articleId),
        metaKey: 'views',
      },
    });

    if (existingMeta) {
      const currentViews = parseInt(existingMeta.metaValue || '0');
      await this.prisma.wpPostMeta.update({
        where: { metaId: existingMeta.metaId },
        data: { metaValue: (currentViews + 1).toString() },
      });
    } else {
      await this.prisma.wpPostMeta.create({
        data: {
          postId: BigInt(articleId),
          metaKey: 'views',
          metaValue: '1',
        },
      });
    }
  }

  private transformImageUrl(imageUrl: string | null): string | null {
    if (!imageUrl) return null;
    
    // For now, return external URLs directly
    // TODO: Implement proxy/caching system later
    return imageUrl;
  }

  private generateNiceUrl(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}