import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryQueryDto } from './dto/category-query.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const { nom } = createCategoryDto;

    // Generate slug if not provided
    const slug = createCategoryDto.niceUrl || this.generateSlug(nom);

    // Ensure slug uniqueness
    const existingCategory = await this.prisma.wpTerm.findFirst({
      where: { slug },
    });

    if (existingCategory) {
      throw new BadRequestException('A category with this slug already exists');
    }

    const category = await this.prisma.wpTerm.create({
      data: {
        name: nom,
        slug,
        termGroup: 0,
      },
    });

    // Create the taxonomy entry for this term
    await this.prisma.wpTermTaxonomy.create({
      data: {
        termId: category.termId,
        taxonomy: 'category',
        description: '',
      },
    });

    return {
      idCat: category.termId,
      nom: category.name,
      niceUrl: category.slug,
      articleCount: 0,
    };
  }

  async findAll(query: CategoryQueryDto) {
    const { page = 1, limit = 50, search, includeEmpty = false } = query;
    const offset = (page - 1) * limit;

    // Build where conditions for term taxonomy (categories only)
    const where: any = {
      termTaxonomies: {
        some: {
          taxonomy: 'category',
        },
      },
    };

    // Search filter
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // Filter out empty categories if requested
    if (!includeEmpty) {
      where.termTaxonomies = {
        some: {
          taxonomy: 'category',
          termRelationships: {
            some: {},
          },
        },
      };
    }

    // Execute query
    const [categories, total] = await Promise.all([
      this.prisma.wpTerm.findMany({
        where,
        include: {
          termTaxonomies: {
            where: { taxonomy: 'category' },
            include: {
              _count: {
                select: {
                  termRelationships: true,
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.wpTerm.count({ where }),
    ]);

    // Transform results
    const transformedCategories = categories.map((category) => ({
      idCat: category.termId,
      nom: category.name,
      niceUrl: category.slug,
      articleCount: category.termTaxonomies[0]?._count?.termRelationships || 0,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      categories: transformedCategories,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getById(id: number) {
    const category = await this.prisma.wpTerm.findUnique({
      where: { termId: id },
      include: {
        termTaxonomies: {
          where: { taxonomy: 'category' },
          include: {
            termRelationships: {
              include: {
                post: {
                  select: {
                    ID: true,
                    postTitle: true,
                    postName: true,
                    postDate: true,
                    postStatus: true,
                    author: {
                      select: {
                        idMember: true,
                        memberName: true,
                      },
                    },
                  },
                },
              },
              take: 10,
              orderBy: {
                post: {
                  postDate: 'desc',
                },
              },
            },
            _count: {
              select: {
                termRelationships: true,
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const termTaxonomy = category.termTaxonomies[0];
    const recentArticles = termTaxonomy?.termRelationships.map((rel) => ({
      idArt: Number(rel.post.ID),
      titre: rel.post.postTitle,
      niceUrl: rel.post.postName,
      date: rel.post.postDate.toISOString(),
      statut: rel.post.postStatus,
      author: rel.post.author,
    })) || [];

    return {
      idCat: category.termId,
      nom: category.name,
      niceUrl: category.slug,
      articleCount: termTaxonomy?._count?.termRelationships || 0,
      recentArticles,
    };
  }

  async getByNiceUrl(niceUrl: string) {
    const category = await this.prisma.wpTerm.findFirst({
      where: { slug: niceUrl },
      include: {
        termTaxonomies: {
          where: { taxonomy: 'category' },
          include: {
            _count: {
              select: {
                termRelationships: true,
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      idCat: category.termId,
      nom: category.name,
      niceUrl: category.slug,
      articleCount: category.termTaxonomies[0]?._count?.termRelationships || 0,
    };
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    const existingCategory = await this.prisma.wpTerm.findUnique({
      where: { termId: id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    const updateData: any = {};

    // Update slug if name changed
    if (updateCategoryDto.nom && updateCategoryDto.nom !== existingCategory.name) {
      updateData.name = updateCategoryDto.nom;
      updateData.slug = this.generateSlug(updateCategoryDto.nom);

      // Check for slug conflicts
      const conflictingCategory = await this.prisma.wpTerm.findFirst({
        where: {
          slug: updateData.slug,
          termId: { not: id },
        },
      });

      if (conflictingCategory) {
        throw new BadRequestException(
          'A category with this slug already exists',
        );
      }
    }

    const updatedCategory = await this.prisma.wpTerm.update({
      where: { termId: id },
      data: updateData,
      include: {
        termTaxonomies: {
          where: { taxonomy: 'category' },
          include: {
            _count: {
              select: {
                termRelationships: true,
              },
            },
          },
        },
      },
    });

    return {
      idCat: updatedCategory.termId,
      nom: updatedCategory.name,
      niceUrl: updatedCategory.slug,
      articleCount: updatedCategory.termTaxonomies[0]?._count?.termRelationships || 0,
    };
  }

  async remove(id: number) {
    const category = await this.prisma.wpTerm.findUnique({
      where: { termId: id },
      include: {
        termTaxonomies: {
          where: { taxonomy: 'category' },
          include: {
            _count: {
              select: {
                termRelationships: true,
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const termTaxonomy = category.termTaxonomies[0];
    if (termTaxonomy && termTaxonomy._count.termRelationships > 0) {
      throw new BadRequestException(
        'Cannot delete category that contains articles. Please move or delete all articles first.',
      );
    }

    // Delete taxonomy first, then term
    if (termTaxonomy) {
      await this.prisma.wpTermTaxonomy.delete({
        where: { termTaxonomyId: termTaxonomy.termTaxonomyId },
      });
    }

    await this.prisma.wpTerm.delete({
      where: { termId: id },
    });

    return { message: 'Category deleted successfully' };
  }

  async getStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id WHERE tt.taxonomy = 'category') as total_categories,
        (SELECT COUNT(DISTINCT tt.term_id) FROM wp_terms t 
         JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id 
         JOIN wp_term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
         WHERE tt.taxonomy = 'category') as categories_with_articles,
        (SELECT COUNT(*) FROM wp_terms t 
         JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id 
         WHERE tt.taxonomy = 'category' AND tt.term_id NOT IN (
           SELECT DISTINCT tt2.term_id FROM wp_term_taxonomy tt2 
           JOIN wp_term_relationships tr ON tt2.term_taxonomy_id = tr.term_taxonomy_id
           WHERE tt2.taxonomy = 'category'
         )) as empty_categories
    `;

    const result = (stats as any[])[0];

    return {
      total_categories: Number(result.total_categories),
      categories_with_articles: Number(result.categories_with_articles),
      empty_categories: Number(result.empty_categories),
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim()
      .substring(0, 100); // Limit length
  }
}
