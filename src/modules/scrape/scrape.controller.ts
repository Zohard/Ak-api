import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ScrapeService } from './scrape.service';

@ApiTags('Scrape')
@Controller('scrape')
export class ScrapeController {
  constructor(private readonly scrapeService: ScrapeService) { }

  @Get('anime')
  @ApiOperation({ summary: 'Scrape anime info from MAL, Nautiljon, and/or AniList' })
  @ApiQuery({ name: 'q', description: 'Anime name or direct URL', required: true })
  @ApiQuery({ name: 'source', description: 'mal | nautiljon | anilist | auto', required: false })
  async scrapeAnime(@Query('q') q: string, @Query('source') source?: 'mal' | 'nautiljon' | 'anilist' | 'auto') {
    return this.scrapeService.scrapeAnime(q, (source || 'auto') as any)
  }

  @Get('manga')
  @ApiOperation({ summary: 'Scrape manga info from Nautiljon' })
  @ApiQuery({ name: 'q', description: 'Manga name or direct URL', required: true })
  async scrapeManga(@Query('q') q: string) {
    return this.scrapeService.scrapeManga(q);
  }

  @Get('manga-planning')
  @ApiOperation({ summary: 'Scrape manga release planning from MangaCollec' })
  @ApiQuery({ name: 'year', description: 'Year (e.g. 2026)', required: true })
  @ApiQuery({ name: 'month', description: 'Month (1-12)', required: true })
  async scrapeMangaPlanning(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.scrapeService.scrapeMangaCollecPlanning(year, month);
  }
}
