import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ArticleRelationsService } from './article-relations.service';
import {
  CreateArticleRelationDto,
  DeleteArticleRelationDto,
} from './dto/article-relation.dto';

@ApiTags('Article Relations')
@Controller('article-relations')
export class ArticleRelationsController {
  constructor(private readonly service: ArticleRelationsService) {}

  @Get('anime/:id')
  @ApiOperation({ summary: 'Get articles related to an anime' })
  @ApiResponse({
    status: 200,
    description: 'List of articles linked to the anime',
  })
  getAnimeArticles(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRelations(id, 'anime');
  }

  @Get('manga/:id')
  @ApiOperation({ summary: 'Get articles related to a manga' })
  @ApiResponse({
    status: 200,
    description: 'List of articles linked to the manga',
  })
  getMangaArticles(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRelations(id, 'manga');
  }

  @Get('business/:id')
  @ApiOperation({ summary: 'Get articles related to a business entry' })
  @ApiResponse({
    status: 200,
    description: 'List of articles linked to the business',
  })
  getBusinessArticles(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRelations(id, 'business');
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add article relation (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Article relation created successfully',
  })
  @ApiResponse({ status: 409, description: 'Relation already exists' })
  @ApiResponse({ status: 404, description: 'Article or entity not found' })
  create(@Body() dto: CreateArticleRelationDto) {
    return this.service.createRelation(dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete article relation (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Article relation deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Relation not found' })
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto?: DeleteArticleRelationDto,
  ) {
    return this.service.deleteRelation(id, dto?.type);
  }
}
