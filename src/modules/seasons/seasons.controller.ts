import { Controller, Get, Param, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { SeasonsService } from './seasons.service';

@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  async getAllSeasons() {
    return this.seasonsService.findAll();
  }

  @Get('current')
  async getCurrentSeason() {
    return this.seasonsService.findCurrent();
  }

  @Get(':id')
  async getSeasonById(@Param('id', ParseIntPipe) id: number) {
    const season = await this.seasonsService.findById(id);
    if (!season) {
      throw new NotFoundException(`Season with ID ${id} not found`);
    }
    return season;
  }

  @Get(':id/animes')
  async getSeasonAnimes(@Param('id', ParseIntPipe) id: number) {
    const season = await this.seasonsService.findById(id);
    if (!season) {
      throw new NotFoundException(`Season with ID ${id} not found`);
    }
    return this.seasonsService.getSeasonAnimes(id);
  }
}
