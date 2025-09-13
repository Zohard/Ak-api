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
import { NautiljonImportService } from './nautiljon-import.service';
import {
  NautiljonImportDto,
  NautiljonAnimeComparisonDto,
  CreateAnimeFromNautiljonDto,
} from './dto/nautiljon-import.dto';

@ApiTags('Admin - Nautiljon Import')
@Controller('admin/nautiljon')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class NautiljonImportController {
  constructor(private readonly nautiljonImportService: NautiljonImportService) {}

  @Post('import-season')
  @ApiOperation({ 
    summary: 'Import season anime list from Nautiljon',
    description: 'Extract anime titles from Nautiljon HTML content or URL and compare with existing database'
  })
  @ApiBody({ type: NautiljonImportDto })
  @ApiResponse({ 
    status: 200, 
    description: 'List of anime with comparison results',
    type: [NautiljonAnimeComparisonDto]
  })
  async importSeasonAnimes(
    @Body() importDto: NautiljonImportDto,
  ): Promise<NautiljonAnimeComparisonDto[]> {
    return this.nautiljonImportService.importSeasonAnimes(importDto);
  }

  @Post('create-anime')
  @ApiOperation({ 
    summary: 'Create anime from Nautiljon data',
    description: 'Create a new anime entry using data scraped from Nautiljon'
  })
  @ApiBody({ type: CreateAnimeFromNautiljonDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Anime created successfully'
  })
  async createAnimeFromNautiljon(
    @Body() createDto: CreateAnimeFromNautiljonDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    return this.nautiljonImportService.createAnimeFromNautiljon(createDto, user);
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
    return this.nautiljonImportService.getStaffAndTagsFromResources(animeId);
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
    return this.nautiljonImportService.importStaffFromResources(animeId, importData.staff);
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
    return this.nautiljonImportService.getTagMappings();
  }
}