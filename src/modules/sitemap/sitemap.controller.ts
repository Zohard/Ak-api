import { Controller, Get, Header } from '@nestjs/common';
import { SitemapService } from './sitemap.service';

@Controller('sitemap')
export class SitemapController {
  constructor(private readonly sitemapService: SitemapService) {}

  @Get('urls')
  @Header('Cache-Control', 'public, max-age=21600')
  async getUrls() {
    return this.sitemapService.getUrls();
  }
}
