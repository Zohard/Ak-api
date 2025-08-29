import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../../common/guards/admin.guard';
import { ArticlePermissionsGuard } from '../../guards/article-permissions.guard';
import { CanManageCategories } from '../../decorators/article-permissions.decorator';
import { CategoriesService } from '../categories.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoryQueryDto } from '../dto/category-query.dto';

@ApiTags('Admin - Categories')
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(ArticlePermissionsGuard)
  @CanManageCategories()
  @ApiOperation({ summary: 'Create a new category (Admin)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories (including empty)' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  findAll(@Query() query: CategoryQueryDto) {
    // Allow admins to see all categories including empty ones
    if (query.includeEmpty === undefined) {
      query.includeEmpty = true;
    }
    return this.categoriesService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get categories statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  getStats() {
    return this.categoriesService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Category retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.getById(id);
  }

  @Patch(':id')
  @UseGuards(ArticlePermissionsGuard)
  @CanManageCategories()
  @ApiOperation({ summary: 'Update a category (Admin)' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(ArticlePermissionsGuard)
  @CanManageCategories()
  @ApiOperation({ summary: 'Delete a category (Admin only)' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 400, description: 'Category contains articles' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
