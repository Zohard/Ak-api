import { Body, Controller, Delete, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { SeasonsService } from './seasons.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@Controller('admin/seasons')
export class AdminSeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

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

