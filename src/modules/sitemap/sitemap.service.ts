import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

@Injectable()
export class SitemapService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  async getUrls(): Promise<SitemapUrl[]> {
    const cacheKey = 'sitemap:urls';
    const cached = await this.cacheService.get<SitemapUrl[]>(cacheKey);
    if (cached) return cached;

    const [animes, mangas, games, articles, reviews, businesses] =
      await Promise.all([
        this.getAnimeUrls(),
        this.getMangaUrls(),
        this.getGameUrls(),
        this.getArticleUrls(),
        this.getReviewUrls(),
        this.getBusinessUrls(),
      ]);

    const staticUrls: SitemapUrl[] = [
      { loc: '/animes', changefreq: 'daily', priority: 0.9 },
      { loc: '/mangas', changefreq: 'daily', priority: 0.9 },
      { loc: '/jeux-video', changefreq: 'weekly', priority: 0.8 },
      { loc: '/articles', changefreq: 'daily', priority: 0.9 },
      { loc: '/rankings', changefreq: 'weekly', priority: 0.7 },
      { loc: '/reviews/all', changefreq: 'daily', priority: 0.8 },
      { loc: '/events', changefreq: 'monthly', priority: 0.5 },
    ];

    const urls = [
      ...staticUrls,
      ...animes,
      ...mangas,
      ...games,
      ...articles,
      ...reviews,
      ...businesses,
    ];

    // Cache for 6 hours
    await this.cacheService.set(cacheKey, urls, 21600);
    return urls;
  }

  private async getAnimeUrls(): Promise<SitemapUrl[]> {
    const animes = await this.prisma.akAnime.findMany({
      where: { statut: 1 },
      select: { idAnime: true, niceUrl: true, titre: true, dateAjout: true },
      orderBy: { idAnime: 'desc' },
    });

    return animes.map((a) => ({
      loc: `/anime/${a.niceUrl || this.slugify(a.titre)}-${a.idAnime}`,
      lastmod: a.dateAjout?.toISOString(),
      changefreq: 'weekly' as const,
      priority: 0.8,
    }));
  }

  private async getMangaUrls(): Promise<SitemapUrl[]> {
    const mangas = await this.prisma.akManga.findMany({
      where: { statut: 1 },
      select: { idManga: true, niceUrl: true, titre: true, dateAjout: true },
      orderBy: { idManga: 'desc' },
    });

    return mangas.map((m) => ({
      loc: `/manga/${m.niceUrl || this.slugify(m.titre)}-${m.idManga}`,
      lastmod: m.dateAjout?.toISOString(),
      changefreq: 'weekly' as const,
      priority: 0.8,
    }));
  }

  private async getGameUrls(): Promise<SitemapUrl[]> {
    const games = await this.prisma.akJeuxVideo.findMany({
      where: { statut: 1 },
      select: { idJeu: true, niceUrl: true, titre: true, dateAjout: true },
      orderBy: { idJeu: 'desc' },
    });

    return games.map((g) => ({
      loc: `/jeu-video/${g.niceUrl || this.slugify(g.titre)}-${g.idJeu}`,
      lastmod: g.dateAjout?.toISOString(),
      changefreq: 'monthly' as const,
      priority: 0.7,
    }));
  }

  private async getArticleUrls(): Promise<SitemapUrl[]> {
    const articles = await this.prisma.wpPost.findMany({
      where: { postStatus: 'publish', postType: 'post' },
      select: { postName: true, postModified: true },
      orderBy: { ID: 'desc' },
    });

    return articles.map((a) => ({
      loc: `/articles/${a.postName}`,
      lastmod: a.postModified?.toISOString(),
      changefreq: 'monthly' as const,
      priority: 0.7,
    }));
  }

  private async getReviewUrls(): Promise<SitemapUrl[]> {
    const reviews = await this.prisma.akCritique.findMany({
      where: { statut: 0 },
      select: { niceUrl: true, dateCritique: true },
      orderBy: { idCritique: 'desc' },
    });

    return reviews
      .filter((r) => r.niceUrl)
      .map((r) => ({
        loc: `/review/${r.niceUrl}`,
        lastmod: r.dateCritique?.toISOString(),
        changefreq: 'monthly' as const,
        priority: 0.6,
      }));
  }

  private async getBusinessUrls(): Promise<SitemapUrl[]> {
    const businesses = await this.prisma.akBusiness.findMany({
      where: { statut: 1 },
      select: { idBusiness: true, niceUrl: true, denomination: true },
      orderBy: { idBusiness: 'desc' },
    });

    return businesses.map((b) => ({
        loc: `/business/${b.niceUrl || this.slugify(b.denomination || 'business')}-${b.idBusiness}`,
        changefreq: 'monthly' as const,
        priority: 0.5,
      }));
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ýÿ]/g, 'y')
      .replace(/[ñ]/g, 'n')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
