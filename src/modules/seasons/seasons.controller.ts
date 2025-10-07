import { Controller, Get, Param, ParseIntPipe, NotFoundException, Post, Body, UseGuards, Delete, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SeasonsService } from './seasons.service';

@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  async getAllSeasons() {
    const seasons = await this.seasonsService.findAll() as any[];

    // Map season number to French season name
    const saisonMap: Record<number, string> = {
      1: 'hiver',
      2: 'printemps',
      3: 'été',
      4: 'automne'
    };

    // Add nom_saison to each season
    return seasons.map((season: any) => ({
      ...season,
      nom_saison: saisonMap[season.saison] || 'été'
    }));
  }

  @Get('current')
  async getCurrentSeason() {
    const season = await this.seasonsService.findCurrent();
    if (!season) {
      return null;
    }

    // Map season number to French season name
    const saisonMap: Record<number, string> = {
      1: 'hiver',
      2: 'printemps',
      3: 'été',
      4: 'automne'
    };

    return {
      ...season,
      nom_saison: saisonMap[season.saison] || 'été'
    };
  }

  @Get(':id')
  async getSeasonById(@Param('id', ParseIntPipe) id: number) {
    const season = await this.seasonsService.findById(id);
    if (!season) {
      throw new NotFoundException(`Season with ID ${id} not found`);
    }

    // Map season number to French season name
    const saisonMap: Record<number, string> = {
      1: 'hiver',
      2: 'printemps',
      3: 'été',
      4: 'automne'
    };

    return {
      ...season,
      nom_saison: saisonMap[season.saison] || 'été'
    };
  }

  @Get(':id/animes')
  async getSeasonAnimes(@Param('id', ParseIntPipe) id: number) {
    const season = await this.seasonsService.findById(id);
    if (!season) {
      throw new NotFoundException(`Season with ID ${id} not found`);
    }
    return this.seasonsService.getSeasonAnimes(id);
  }

  // Admin endpoints
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  async createSeason(@Body() body: { annee: number; saison: number; statut?: number }) {
    if (!body || typeof body.annee !== 'number' || typeof body.saison !== 'number') {
      throw new NotFoundException('annee and saison are required')
    }
    return this.seasonsService.createSeason(body)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post(':id/animes')
  async addAnime(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { animeId: number },
    @Request() _req: any,
  ) {
    if (!body || typeof body.animeId !== 'number') {
      throw new NotFoundException('animeId is required')
    }
    const season = await this.seasonsService.findById(id)
    if (!season) throw new NotFoundException(`Season with ID ${id} not found`)
    return this.seasonsService.addAnimeToSeason(id, body.animeId)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id/animes/:animeId')
  async removeAnime(
    @Param('id', ParseIntPipe) id: number,
    @Param('animeId', ParseIntPipe) animeId: number,
  ) {
    const season = await this.seasonsService.findById(id)
    if (!season) throw new NotFoundException(`Season with ID ${id} not found`)
    return this.seasonsService.removeAnimeFromSeason(id, animeId)
  }
}
