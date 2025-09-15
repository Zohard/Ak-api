import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SourcesExternesService } from './sources-externes.service';
import {
  SourcesExternesImportDto,
  SourcesExternesAnimeComparisonDto,
  CreateAnimeFromSourcesExternesDto,
} from './dto/sources-externes.dto';

@ApiTags('Admin - Sources Externes')
@Controller('admin/sources-externes')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class SourcesExternesController {
  constructor(private readonly sourcesExternesService: SourcesExternesService) {}

  @Post('import-season')
  @ApiOperation({ 
    summary: 'Import season anime list from external sources',
    description: 'Extract anime titles from external sources HTML content or URL and compare with existing database'
  })
  @ApiBody({ type: SourcesExternesImportDto })
  @ApiResponse({ 
    status: 200, 
    description: 'List of anime with comparison results',
    type: [SourcesExternesAnimeComparisonDto]
  })
  async importSeasonAnimes(
    @Body() importDto: SourcesExternesImportDto,
  ): Promise<SourcesExternesAnimeComparisonDto[]> {
    return this.sourcesExternesService.importSeasonAnimes(importDto);
  }

  @Post('create-anime')
  @ApiOperation({ 
    summary: 'Create anime from external sources data',
    description: 'Create a new anime entry using data scraped from external sources'
  })
  @ApiBody({ type: CreateAnimeFromSourcesExternesDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Anime created successfully'
  })
  async createAnimeFromNautiljon(
    @Body() createDto: CreateAnimeFromSourcesExternesDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    return this.sourcesExternesService.createAnimeFromNautiljon(createDto, user);
  }

  @Get('anime/:id/resources')
  @ApiOperation({
    summary: 'Get staff and tags from anime resources',
    description: 'Extract staff and tags data from the stored resources JSON for auto-completion'
  })
  @ApiResponse({
    status: 200,
    description: 'Staff and tags data for auto-completion'
  })
  async getStaffAndTags(
    @Param('id', ParseIntPipe) animeId: number,
  ): Promise<any> {
    return this.sourcesExternesService.getStaffAndTagsFromResources(animeId);
  }

  @Get('anime/:id/characters-html')
  @ApiOperation({
    summary: 'Get characters and voice actors as HTML structure',
    description: 'Get characters with Japanese voice actors formatted as HTML table rows'
  })
  @ApiResponse({
    status: 200,
    description: 'HTML structure for characters and Japanese voice actors'
  })
  async getCharactersAsHtml(
    @Param('id', ParseIntPipe) animeId: number,
  ): Promise<{ html: string }> {
    return this.sourcesExternesService.getCharactersAsHtml(animeId);
  }

  @Get('anime/:id/doublage')
  @ApiOperation({
    summary: 'Get doublage field from anime resources',
    description: 'Get Japanese voice actors and characters formatted for doublage field'
  })
  @ApiResponse({
    status: 200,
    description: 'Doublage string formatted as {voice actor} ({character}), ...'
  })
  async getDoublageFromResources(
    @Param('id', ParseIntPipe) animeId: number,
  ): Promise<{ doublage: string }> {
    return this.sourcesExternesService.getDoublageFromResources(animeId);
  }

  @Post('anime/:id/import-staff')
  @ApiOperation({
    summary: 'Import staff from resources',
    description: 'Import selected staff members from anime resources to business relationships'
  })
  @ApiResponse({
    status: 200,
    description: 'Staff import results'
  })
  async importStaffFromResources(
    @Param('id', ParseIntPipe) animeId: number,
    @Body() importData: { staff: Array<{ businessId: number, role: string }> },
  ): Promise<any> {
    return this.sourcesExternesService.importStaffFromResources(animeId, importData.staff);
  }

  @Get('tag-mappings')
  @ApiOperation({
    summary: 'Get tag mappings',
    description: 'Get all available tag mappings for genres/themes to form tag IDs'
  })
  @ApiResponse({
    status: 200,
    description: 'Tag mappings for frontend form'
  })
  async getTagMappings(): Promise<any> {
    return this.sourcesExternesService.getTagMappings();
  }

  @Post('import-image')
  @ApiOperation({
    summary: 'Import anime image to ImageKit',
    description: 'Download and upload an anime image from MAL/external sources to ImageKit'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL of the image to import' },
        animeTitle: { type: 'string', description: 'Title of the anime for filename generation' }
      },
      required: ['imageUrl', 'animeTitle']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Image import result'
  })
  async importImage(
    @Body() importData: { imageUrl: string; animeTitle: string },
  ): Promise<any> {
    return this.sourcesExternesService.importAnimeImage(importData.imageUrl, importData.animeTitle);
  }
}