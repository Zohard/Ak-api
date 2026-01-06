import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { R2Service } from '../media/r2.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleQueryDto } from './dto/article-query.dto';
import { PublishArticleDto } from './dto/publish-article.dto';
import { SMFGroup } from '../../shared/constants/rbac.constants';

@Injectable()
export class ArticlesService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private imagekitService: R2Service,
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

    // Try to get from cache first (skip cache for admin status filters)
    if (query.status !== 'draft' && query.status !== 'archived') {
      const cached = await this.cacheService.getArticlesList(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const {
      page = 1,
      limit = 8,
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
          // Include author relationship from wp_users
          wpAuthor: {
            select: {
              ID: true,
              userLogin: true,
              displayName: true,
            },
          },
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
                { metaKey: 'ak_img' },
                { metaKey: 'img' },
                { metaKey: 'imgunebig' },
                { metaKey: 'imgunebig2' },
                { metaKey: 'views' },
                { metaKey: 'excerpt' },
              ],
            },
            take: 10, // Limit meta fields
          },
          // Include webzine images (filter out null urlImg values)
          images: {
            where: {
              urlImg: {
                not: null,
              },
            },
            select: {
              idImg: true,
              urlImg: true,
            },
            take: 1, // Only get the first image for the article
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
      const imgunebigMeta = post.postMeta.find(meta => meta.metaKey === 'imgunebig');
      const imgunebig2Meta = post.postMeta.find(meta => meta.metaKey === 'imgunebig2');

      // Extract categories (filter for category taxonomy only) with better safety checks
      const categories = post.termRelationships
        .filter(rel => rel.termTaxonomy && rel.termTaxonomy.term && rel.termTaxonomy.taxonomy === 'category')
        .map(rel => ({
          id: rel.termTaxonomy.term.termId,
          idCat: rel.termTaxonomy.term.termId,
          name: rel.termTaxonomy.term.name,
          nom: rel.termTaxonomy.term.name,
          slug: rel.termTaxonomy.term.slug,
          niceUrl: rel.termTaxonomy.term.slug,
        }));

      // Get the best image URL (prioritize imgunebig, don't use _thumbnail_id as it's just an integer ID)
      const webzineImageUrl = post.images?.[0]?.urlImg;
      const imgunebig = imgunebigMeta?.metaValue;
      const imgunebig2 = imgunebig2Meta?.metaValue;
      const imageUrl = imgunebig ||
        imgunebig2 ||
        webzineImageUrl ||
        akImgMeta?.metaValue ||
        imgMeta?.metaValue ||
        this.extractFirstImageFromContent(post.postContent);

      return {
        idArt: Number(post.ID),
        ID: Number(post.ID),
        titre: post.postTitle,
        postTitle: post.postTitle,
        niceUrl: post.postName,
        postName: post.postName,
        date: post.postDate.toISOString(),
        postDate: post.postDate.toISOString(),
        img: this.transformImageUrl(imageUrl),
        imgunebig: this.transformImageUrl(imgunebig || null),
        imgunebig2: this.transformImageUrl(imgunebig2 || null),
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
        author: post.wpAuthor ? {
          ID: Number(post.wpAuthor.ID),
          id: Number(post.wpAuthor.ID),
          userLogin: post.wpAuthor.userLogin,
          username: post.wpAuthor.userLogin,
          displayName: post.wpAuthor.displayName,
        } : {
          ID: null,
          id: null,
          userLogin: 'Unknown',
          username: 'Unknown',
          displayName: 'Unknown',
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

  async getById(id: number, includeContent: boolean = true, skipCache: boolean = false) {
    // Skip cache for admin requests to always get fresh data
    if (!skipCache) {
      const cached = await this.cacheService.getArticle(id);
      if (cached) {
        return cached;
      }
    }

    // Build where clause - skip postStatus filter for admin (when skipCache is true)
    const whereClause: any = {
      ID: BigInt(id),
      postType: 'post',
    };

    // Only filter by publish status for public requests (when not skipping cache)
    if (!skipCache) {
      whereClause.postStatus = 'publish';
    }

    const post = await this.prisma.wpPost.findFirst({
      where: whereClause,
      include: {
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
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
        // Include webzine images (filter out null urlImg values)
        images: {
          where: {
            urlImg: {
              not: null,
            },
          },
          select: {
            idImg: true,
            urlImg: true,
          },
          orderBy: { idImg: 'desc' },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Article not found');
    }

    // Debug logging for article 3920
    if (id === 3920) {
      console.log('Article 3920 from database:', {
        ID: post.ID,
        postTitle: post.postTitle,
        postContentLength: post.postContent ? post.postContent.length : 'null/undefined',
        postExcerptLength: post.postExcerpt ? post.postExcerpt.length : 'null/undefined',
        includeContent
      });
    }

    // Increment view count
    await this.incrementViewCount(id);

    const result = this.transformPost(post, includeContent);

    // Only cache if not skipping cache (i.e., not an admin request)
    if (!skipCache) {
      await this.cacheService.setArticle(id, result, 1800);
    }

    return result;
  }

  async getByNiceUrl(niceUrl: string, includeContent: boolean = true, isAdmin: boolean = false) {
    // Skip cache for admins viewing drafts
    if (!isAdmin) {
      const cached = await this.cacheService.getArticleBySlug(niceUrl);
      if (cached) {
        return cached;
      }
    }

    // WordPress stores slugs with URL-encoded special characters (e.g., %e2%99%aa for ♪)
    // We need to encode the slug to match what's in the database
    const encodedSlug = encodeURIComponent(niceUrl).toLowerCase();

    // Build the post status filter based on admin access
    const postStatusFilter = isAdmin
      ? { in: ['publish', 'draft'] }  // Admins can see both published and draft
      : 'publish';                     // Non-admins only see published

    const post = await this.prisma.wpPost.findFirst({
      where: {
        OR: [
          { postName: niceUrl },           // Try exact match first
          { postName: encodedSlug },       // Try encoded version
        ],
        postType: 'post',
        postStatus: postStatusFilter
      },
      include: {
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
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
        // Include webzine images (filter out null urlImg values)
        images: {
          where: {
            urlImg: {
              not: null,
            },
          },
          select: {
            idImg: true,
            urlImg: true,
          },
          orderBy: { idImg: 'desc' },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Article not found');
    }

    // Only increment view count for published articles
    if (post.postStatus === 'publish') {
      await this.incrementViewCount(Number(post.ID));
    }

    const result = this.transformPost(post, includeContent);

    // Only cache published articles
    if (post.postStatus === 'publish') {
      await this.cacheService.setArticleBySlug(niceUrl, result, 1800);
    }

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
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
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
        // Include webzine images (filter out null urlImg values)
        images: {
          where: {
            urlImg: {
              not: null,
            },
          },
          select: {
            idImg: true,
            urlImg: true,
          },
          take: 1, // Only get the first image for the article
        },
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
    // Ensure the SMF user exists in wp_users table for authorship
    await this.ensureWpUserExists(authorId);

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

    // Validate categories if provided
    if (articleData.categoryIds && articleData.categoryIds.length > 0) {
      await this.validateCategories(articleData.categoryIds);
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
      toPing: '',
      pinged: '',
      guid: `http://localhost:3003/?p=${Date.now()}`,
      menuOrder: 0,
      commentCount: 0,
    };

    const article = await this.prisma.wpPost.create({
      data: createData,
      include: {
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
          },
        },
        comments: {
          where: { commentApproved: '1' },
        },
        postMeta: true,
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
      },
    });

    // Assign categories if provided
    if (articleData.categoryIds && articleData.categoryIds.length > 0) {
      await this.assignCategoriesToArticle(Number(article.ID), articleData.categoryIds);
    }

    // If an image is provided, create an entry in ak_webzine_img
    if (articleData.img) {
      console.log('Creating ak_webzine_img entry for article:', article.ID, 'with image:', articleData.img);
      try {
        const imageEntry = await this.prisma.akWebzineImg.create({
          data: {
            idArt: article.ID,
            urlImg: articleData.img,
          },
        });
        console.log('Successfully created ak_webzine_img entry:', imageEntry);
      } catch (error) {
        console.error('Error creating ak_webzine_img entry:', error);
        throw error;
      }
    } else {
      console.log('No image provided in articleData.img');
    }

    // Re-fetch the article with categories to return complete data
    const articleWithCategories = await this.prisma.wpPost.findUnique({
      where: { ID: article.ID },
      include: {
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
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
        },
        postMeta: true,
        images: {
          where: {
            urlImg: {
              not: null,
            },
          },
          select: {
            idImg: true,
            urlImg: true,
          },
        },
      },
    });

    return this.transformPost(articleWithCategories, true);
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

    // Validate categories if provided
    if (updateData.categoryIds && updateData.categoryIds.length > 0) {
      await this.validateCategories(updateData.categoryIds);
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
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
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

    // Update categories if provided
    if (updateData.categoryIds !== undefined) {
      // Remove existing category assignments
      await this.removeAllCategoriesFromArticle(id);

      // Assign new categories if any provided
      if (updateData.categoryIds.length > 0) {
        await this.assignCategoriesToArticle(id, updateData.categoryIds);
      }
    }

    // Handle image update if provided
    if (updateData.img) {
      console.log('Updating image for article:', id, 'with image:', updateData.img);
      try {
        // First check if an image entry already exists for this article
        const existingImage = await this.prisma.akWebzineImg.findFirst({
          where: { idArt: BigInt(id) },
        });

        if (existingImage) {
          // Update existing image
          console.log('Updating existing ak_webzine_img entry:', existingImage.idImg);
          await this.prisma.akWebzineImg.update({
            where: { idImg: existingImage.idImg },
            data: { urlImg: updateData.img },
          });
          console.log('Successfully updated ak_webzine_img entry');
        } else {
          // Create new image entry
          console.log('Creating new ak_webzine_img entry for article:', id);
          const imageEntry = await this.prisma.akWebzineImg.create({
            data: {
              idArt: BigInt(id),
              urlImg: updateData.img,
            },
          });
          console.log('Successfully created ak_webzine_img entry:', imageEntry);
        }
      } catch (error) {
        console.error('Error handling image update:', error);
        throw error;
      }
    } else {
      console.log('No image provided in updateData.img for article:', id);
    }

    // Re-fetch the article with updated categories
    const articleWithCategories = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(id) },
      include: {
        wpAuthor: {
          select: {
            ID: true,
            userLogin: true,
            displayName: true,
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
        },
        postMeta: true,
        images: {
          where: {
            urlImg: {
              not: null,
            },
          },
          select: {
            idImg: true,
            urlImg: true,
          },
        },
      },
    });

    return this.transformPost(articleWithCategories, true);
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

    // Invalidate cache for this article
    await this.cacheService.invalidateArticle(id);

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
    const imgunebig2Meta = post.postMeta?.find(meta => meta.metaKey === 'imgunebig2');
    const tagsMeta = post.postMeta?.find(meta => meta.metaKey === 'tags');

    // Extract categories with better safety checks
    const categories = post.termRelationships
      ?.filter(rel => rel.termTaxonomy && rel.termTaxonomy.term)
      .map(rel => ({
        id: rel.termTaxonomy.term.termId,
        idCat: rel.termTaxonomy.term.termId,
        name: rel.termTaxonomy.term.name,
        nom: rel.termTaxonomy.term.name,
        slug: rel.termTaxonomy.term.slug,
        niceUrl: rel.termTaxonomy.term.slug,
      })) || [];

    // Log if categories are empty for debugging
    if (categories.length === 0 && post.termRelationships?.length > 0) {
      console.warn(`Article ${post.ID}: termRelationships exist but no valid categories found`, {
        relationshipsCount: post.termRelationships.length,
        firstRel: post.termRelationships[0]
      });
    }

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

    // Transform images
    const images = post.images?.map(image => ({
      id: image.idImg,
      filename: image.urlImg,
      articleId: Number(image.idArt),
      imagekitUrl: this.imagekitService.getImageUrl(image.urlImg),
      thumbnailUrl: this.imagekitService.getImageUrl(image.urlImg, [
        { height: '200', width: '200', crop: 'maintain_ratio' }
      ]),
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
      img: (() => {
        const webzineImg = post.images?.[0]?.urlImg;
        const akImg = akImgMeta?.metaValue;
        const img = imgMeta?.metaValue;
        const imgunebig = imgunebigMeta?.metaValue;
        const imgunebig2 = imgunebig2Meta?.metaValue;
        const extracted = this.extractFirstImageFromContent(post.postContent);

        console.log(`Article ${post.ID} image sources:`, {
          webzineImg, akImg, img, imgunebig, imgunebig2, extracted
        });

        // Prioritize imgunebig over other sources, don't use _thumbnail_id (it's just an integer ID)
        return this.transformImageUrl(imgunebig || imgunebig2 || webzineImg || akImg || img || extracted);
      })(),
      imgunebig: this.transformImageUrl(imgunebigMeta?.metaValue),
      imgunebig2: this.transformImageUrl(imgunebig2Meta?.metaValue),
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
      author: post.wpAuthor ? {
        id: post.wpAuthor.ID,
        username: post.wpAuthor.userLogin,
        displayName: post.wpAuthor.displayName,
      } : {
        id: null,
        username: 'Unknown',
        displayName: 'Unknown',
      },
      categories,
      comments,
      images,
      content: includeContent ? post.postContent : undefined,
      contenu: includeContent ? post.postContent : undefined,
      postContent: includeContent ? post.postContent : undefined,
      texte: includeContent ? post.postContent : (post.postExcerpt || '').substring(0, 200),
      imageCount: images.length,
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

    // If it's already a full URL, return as is
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }

    // If it's an R2 path, generate the full URL
    return this.imagekitService.getImageUrl(imageUrl);
  }

  private extractFirstImageFromContent(content: string | null): string | null {
    if (!content) return null;

    // Extract the first image src from HTML content
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
    const match = content.match(imgRegex);

    if (match && match[1]) {
      console.log('Extracted image from content:', match[1]);
      return match[1];
    }

    return null;
  }

  async importImageFromUrl(articleId: number, imageUrl: string, customFileName?: string): Promise<any> {
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(articleId) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    try {
      const fileName = customFileName || `article-${articleId}-${Date.now()}`;
      const folder = 'webzine/articles';

      const uploadResult = await this.imagekitService.uploadImageFromUrl(
        imageUrl,
        fileName,
        folder
      );

      const image = await this.prisma.akWebzineImg.create({
        data: {
          idArt: BigInt(articleId),
          urlImg: uploadResult.filename,
        },
      });

      return {
        message: 'Image imported and uploaded to R2 successfully',
        image: {
          id: image.idImg,
          filename: image.urlImg,
          articleId: Number(image.idArt),
          imagekitUrl: uploadResult.url,
          originalUrl: imageUrl,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to import image: ${error.message}`);
    }
  }

  async importR2File(articleId: number, imagePath: string): Promise<any> {
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(articleId) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const image = await this.prisma.akWebzineImg.create({
      data: {
        idArt: BigInt(articleId),
        urlImg: imagePath,
      },
    });

    return {
      message: 'R2 file associated with article successfully',
      image: {
        id: image.idImg,
        filename: image.urlImg,
        articleId: Number(image.idArt),
        imagekitUrl: this.imagekitService.getImageUrl(imagePath),
      },
    };
  }

  async bulkImportImagesFromUrls(articleId: number, imageUrls: string[]): Promise<any> {
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(articleId) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const results: Array<{
      imageUrl: string;
      status: string;
      data?: any;
      message?: string;
    }> = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      try {
        const fileName = `article-${articleId}-bulk-${i + 1}-${Date.now()}`;
        const folder = 'webzine/articles';

        const uploadResult = await this.imagekitService.uploadImageFromUrl(
          imageUrl,
          fileName,
          folder
        );

        const image = await this.prisma.akWebzineImg.create({
          data: {
            idArt: BigInt(articleId),
            urlImg: uploadResult.filename,
          },
        });

        results.push({
          imageUrl,
          status: 'success',
          data: {
            id: image.idImg,
            filename: image.urlImg,
            articleId: Number(image.idArt),
            imagekitUrl: uploadResult.url,
            originalUrl: imageUrl,
          },
        });
      } catch (error) {
        results.push({
          imageUrl,
          status: 'error',
          message: error.message,
        });
      }
    }

    return {
      message: 'Bulk image import from URLs completed',
      results,
    };
  }

  async bulkImportR2Files(articleId: number, imagePaths: string[]): Promise<any> {
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(articleId) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const results: Array<{
      imagePath: string;
      status: string;
      data?: any;
      message?: string;
    }> = [];

    for (const imagePath of imagePaths) {
      try {
        const image = await this.prisma.akWebzineImg.create({
          data: {
            idArt: BigInt(articleId),
            urlImg: imagePath,
          },
        });

        results.push({
          imagePath,
          status: 'success',
          data: {
            id: image.idImg,
            filename: image.urlImg,
            articleId: Number(image.idArt),
            imagekitUrl: this.imagekitService.getImageUrl(imagePath),
          },
        });
      } catch (error) {
        results.push({
          imagePath,
          status: 'error',
          message: error.message,
        });
      }
    }

    return {
      message: 'Bulk R2 files association completed',
      results,
    };
  }

  async getArticleImages(articleId: number): Promise<any> {
    const images = await this.prisma.akWebzineImg.findMany({
      where: { idArt: BigInt(articleId) },
      orderBy: { idImg: 'desc' },
    });

    return {
      articleId,
      images: images
        .filter(image => image.urlImg !== null)
        .map(image => ({
          id: image.idImg,
          filename: image.urlImg,
          articleId: Number(image.idArt),
          imagekitUrl: this.imagekitService.getImageUrl(image.urlImg!),
          thumbnailUrl: this.imagekitService.getImageUrl(image.urlImg!, [
            { height: '200', width: '200', crop: 'maintain_ratio' }
          ]),
        })),
    };
  }

  async removeImage(imageId: number): Promise<any> {
    const image = await this.prisma.akWebzineImg.findUnique({
      where: { idImg: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.prisma.akWebzineImg.delete({
      where: { idImg: imageId },
    });

    return { message: 'Image removed successfully' };
  }

  private generateNiceUrl(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Ensures that an SMF user exists in the wp_users table
   * This is necessary because articles use wp_users for authorship
   * but authentication uses smf_member table
   */
  private async ensureWpUserExists(smfUserId: number): Promise<void> {
    // Check if user already exists in wp_users with this ID
    const existingWpUser = await this.prisma.wpUser.findUnique({
      where: { ID: BigInt(smfUserId) },
    });

    if (existingWpUser) {
      // User already exists, no action needed
      return;
    }

    // Get the SMF user data
    const smfUser = await this.prisma.smfMember.findUnique({
      where: { idMember: smfUserId },
    });

    if (!smfUser) {
      throw new NotFoundException(`User with ID ${smfUserId} not found`);
    }

    // Create wp_user entry with the same ID as SMF user
    const now = new Date();
    await this.prisma.wpUser.create({
      data: {
        ID: BigInt(smfUserId),
        userLogin: smfUser.memberName,
        userPass: '', // Password is managed by SMF, not WordPress
        userNicename: smfUser.memberName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        userEmail: smfUser.emailAddress,
        userUrl: '',
        userRegistered: now,
        userActivationKey: '',
        userStatus: 0,
        displayName: smfUser.realName || smfUser.memberName,
      },
    });

    console.log(`Created wp_user entry for SMF user ${smfUserId} (${smfUser.memberName})`);
  }

  private async validateCategories(categoryIds: number[]): Promise<void> {
    const existingCategories = await this.prisma.wpTerm.findMany({
      where: {
        termId: { in: categoryIds },
        termTaxonomies: {
          some: {
            taxonomy: 'category',
          },
        },
      },
    });

    if (existingCategories.length !== categoryIds.length) {
      const foundIds = existingCategories.map(cat => cat.termId);
      const missingIds = categoryIds.filter(id => !foundIds.includes(id));
      throw new BadRequestException(`Categories not found: ${missingIds.join(', ')}`);
    }
  }

  private async assignCategoriesToArticle(articleId: number, categoryIds: number[]): Promise<void> {
    // Get term taxonomy IDs for the given category IDs
    const termTaxonomies = await this.prisma.wpTermTaxonomy.findMany({
      where: {
        termId: { in: categoryIds },
        taxonomy: 'category',
      },
    });

    // Create relationships
    const relationshipData = termTaxonomies.map(tt => ({
      objectId: BigInt(articleId),
      termTaxonomyId: tt.termTaxonomyId,
      termOrder: 0,
    }));

    await this.prisma.wpTermRelationship.createMany({
      data: relationshipData,
      skipDuplicates: true,
    });

    // Update category counts
    for (const termTaxonomy of termTaxonomies) {
      await this.prisma.wpTermTaxonomy.update({
        where: { termTaxonomyId: termTaxonomy.termTaxonomyId },
        data: {
          count: {
            increment: 1,
          },
        },
      });
    }
  }

  private async removeAllCategoriesFromArticle(articleId: number): Promise<void> {
    // Get existing category relationships for this article
    const existingRelationships = await this.prisma.wpTermRelationship.findMany({
      where: {
        objectId: BigInt(articleId),
        termTaxonomy: {
          taxonomy: 'category',
        },
      },
      include: {
        termTaxonomy: true,
      },
    });

    // Remove relationships
    await this.prisma.wpTermRelationship.deleteMany({
      where: {
        objectId: BigInt(articleId),
        termTaxonomy: {
          taxonomy: 'category',
        },
      },
    });

    // Update category counts
    for (const relationship of existingRelationships) {
      await this.prisma.wpTermTaxonomy.update({
        where: { termTaxonomyId: relationship.termTaxonomy.termTaxonomyId },
        data: {
          count: {
            decrement: 1,
          },
        },
      });
    }
  }
}