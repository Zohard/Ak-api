import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { NautiljonImportService } from './nautiljon-import.service';
import {
  NautiljonImportDto,
  NautiljonAnimeComparisonDto,
  CreateAnimeFromNautiljonDto,
} from './dto/nautiljon-import.dto';

@ApiTags('Admin - Nautiljon Import')
@Controller('admin/nautiljon')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
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
    @GetUser() user: any,
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
}