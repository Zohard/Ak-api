import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../shared/services/cache.service';
import { ReviewsService } from '../reviews/reviews.service';
import { SeasonsService } from '../seasons/seasons.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { AnimeRankingsService } from '../animes/services/anime-rankings.service';

@Injectable()
export class MobileHomePageService {
  private readonly logger = new Logger(MobileHomePageService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
    private readonly seasonsService: SeasonsService,
    private readonly rankingsService: AnimeRankingsService,
  ) { }

  async getMobileHomePageData() {
    const CACHE_KEY = 'mobile-homepage:aggregated';
    const CACHE_TTL = 1800; // 30 minutes

    // Try full cache first
    const cached = await this.cache.get<any>(CACHE_KEY);
    if (cached) {
      this.logger.log('HIT: mobile-homepage aggregated cache');
      return cached;
    }

    this.logger.log('MISS: mobile-homepage - fetching all data...');

    // Fetch all data in parallel
    const [
      seasonData,
      reviews,
      topAnimes,
      recentAnimes,
      recentMangas,
      anticipatedGames,
    ] = await Promise.all([
      this.fetchCurrentSeasonAnimes(),
      this.fetchRecentReviews(),
      this.fetchTopAnimes(),
      this.fetchRecentAnimes(),
      this.fetchRecentMangas(),
      this.fetchAnticipatedGames(),
    ]);

    const result = {
      season: seasonData,
      reviews,
      topAnimes,
      recentAnimes,
      recentMangas,
      anticipatedGames,
      generatedAt: new Date().toISOString(),
    };

    // Cache the aggregated result
    await this.cache.set(CACHE_KEY, result, CACHE_TTL);
    this.logger.log('✅ Cached mobile-homepage aggregated data');

    return result;
  }

  private async fetchCurrentSeasonAnimes() {
    try {
      const season = await this.seasonsService.findCurrent();
      if (!season?.id_saison) {
        return { current: null, animes: [] };
      }

      const animes = await this.seasonsService.getSeasonAnimes(season.id_saison);
      // Shuffle and take 15 for variety
      const shuffled = (animes as any[]).sort(() => Math.random() - 0.5).slice(0, 15);

      return {
        current: {
          id: season.id_saison,
          saison: season.saison,
          annee: season.annee,
        },
        animes: shuffled.map(this.formatAnime),
      };
    } catch (e) {
      this.logger.error('Error fetching current season:', e);
      return { current: null, animes: [] };
    }
  }

  private async fetchRecentReviews() {
    try {
      const response = await this.reviewsService.findAll({
        limit: 15,
        sortBy: 'dateCritique',
        sortOrder: 'desc',
        statut: 0, // Public only
      } as any);

      const raw = (response as any)?.reviews || (response as any)?.data || [];
      return Array.isArray(raw) ? raw.map(this.formatReview) : [];
    } catch (e) {
      this.logger.error('Error fetching recent reviews:', e);
      return [];
    }
  }

  private async fetchTopAnimes() {
    try {
      // Get top 10 animes based on collection ratings
      const result = await this.rankingsService.getTopAnimes(10, 'collection-bayes');
      return result?.topAnimes || [];
    } catch (e) {
      this.logger.error('Error fetching top animes:', e);
      return [];
    }
  }

  private async fetchRecentAnimes() {
    try {
      const animes = await this.prisma.akAnime.findMany({
        where: { statut: 1, dateAjout: { not: null } },
        orderBy: { dateAjout: 'desc' },
        take: 15,
        select: {
          idAnime: true,
          titre: true,
          niceUrl: true,
          image: true,
          annee: true,
          studio: true,
          dateAjout: true,
          moyenneNotes: true,
        },
      });

      return animes.map(this.formatAnime);
    } catch (e) {
      this.logger.error('Error fetching recent animes:', e);
      return [];
    }
  }

  private async fetchRecentMangas() {
    try {
      this.logger.log('Fetching recent mangas (statut=1)...');
      const mangas = await this.prisma.akManga.findMany({
        where: { statut: 1 },
        orderBy: { dateAjout: 'desc' },
        take: 15,
        select: {
          idManga: true,
          titre: true,
          niceUrl: true,
          image: true,
          annee: true,
          editeur: true,
          origine: true,
          dateAjout: true,
          moyenneNotes: true,
          statut: true,
        },
      });

      this.logger.log(`Found ${mangas.length} recent mangas matching criteria`);
      if (mangas.length === 0) {
        const totalMangas = await this.prisma.akManga.count();
        const activeMangas = await this.prisma.akManga.count({ where: { statut: 1 } });
        this.logger.warn(`DEBUG INFO: Total mangas: ${totalMangas}, Mangas with statut=1: ${activeMangas}`);

        if (activeMangas === 0 && totalMangas > 0) {
          const sampleStatus = await this.prisma.akManga.findFirst({ select: { statut: true } });
          this.logger.warn(`Sample manga has statut: ${sampleStatus?.statut}`);
        }
      } else {
        this.logger.log(`Recent mangas: ${mangas.slice(0, 3).map(m => m.titre).join(', ')}`);
      }

      return mangas.map((m: any) => ({
        id: m.idManga,
        idManga: m.idManga,
        titre: m.titre,
        niceUrl: m.niceUrl,
        image: m.image ? `/api/media/serve/manga/${m.image}` : null,
        annee: m.annee,
        editeur: m.editeur,
        origine: m.origine,
        dateAjout: m.dateAjout?.toISOString?.() || m.dateAjout,
        moyenneNotes: m.moyenneNotes,
      }));
    } catch (e) {
      this.logger.error('Error fetching recent mangas:', e);
      return [];
    }
  }

  private async fetchAnticipatedGames() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch games with release dates in the future (next 3 months)
      const threeMonthsLater = new Date(today);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      const games = await this.prisma.akJeuxVideo.findMany({
        where: {
          statut: 1,
          OR: [
            { dateSortieEurope: { gte: today, lte: threeMonthsLater } },
            { dateSortieWorldwide: { gte: today, lte: threeMonthsLater } },
            { dateSortieUsa: { gte: today, lte: threeMonthsLater } },
            { dateSortieJapon: { gte: today, lte: threeMonthsLater } },
          ],
        },
        orderBy: [
          { dateSortieEurope: 'asc' },
          { dateSortieWorldwide: 'asc' },
          { dateSortieUsa: 'asc' },
          { dateSortieJapon: 'asc' },
        ],
        take: 15,
        select: {
          idJeu: true,
          titre: true,
          niceUrl: true,
          image: true,
          annee: true,
          editeur: true,
          plateforme: true,
          dateSortieEurope: true,
          dateSortieWorldwide: true,
          dateSortieUsa: true,
          dateSortieJapon: true,
        },
      });

      return games.map((g: any) => ({
        id: g.idJeu,
        idJeu: g.idJeu,
        titre: g.titre,
        niceUrl: g.niceUrl,
        image: g.image ? `/api/media/serve/jeu/${g.image}` : null,
        annee: g.annee,
        editeur: g.editeur,
        plateforme: g.plateforme,
        dateSortieEurope: g.dateSortieEurope?.toISOString?.()?.split('T')[0] || null,
        dateSortieWorldwide: g.dateSortieWorldwide?.toISOString?.()?.split('T')[0] || null,
        dateSortieUsa: g.dateSortieUsa?.toISOString?.()?.split('T')[0] || null,
        dateSortieJapon: g.dateSortieJapon?.toISOString?.()?.split('T')[0] || null,
      }));
    } catch (e) {
      this.logger.error('Error fetching anticipated games:', e);
      return [];
    }
  }

  private formatAnime(anime: any) {
    return {
      id: anime.idAnime || anime.id,
      idAnime: anime.idAnime || anime.id,
      titre: anime.titre,
      niceUrl: anime.niceUrl,
      image: anime.image
        ? typeof anime.image === 'string' && /^https?:\/\//.test(anime.image)
          ? anime.image
          : `/api/media/serve/anime/${anime.image}`
        : null,
      annee: anime.annee,
      studio: anime.studio,
      dateAjout: anime.dateAjout?.toISOString?.() || anime.dateAjout,
      moyenneNotes: anime.moyenneNotes,
      format: anime.format || 'Série TV',
    };
  }

  private formatReview(r: any) {
    let mediaType = 'anime';
    if (r.manga || r.idManga > 0) mediaType = 'manga';
    if (r.jeuxVideo || r.idJeu > 0) mediaType = 'game';

    let image = r.image;
    if (!image && r.anime) image = r.anime.image;
    if (!image && r.manga) image = r.manga.image;
    if (!image && r.jeuxVideo) image = r.jeuxVideo.image;

    const mediaTitle = r.anime?.titre || r.manga?.titre || r.jeuxVideo?.titre || r.titre;

    return {
      idCritique: r.idCritique || r.id,
      niceUrl: r.niceUrl,
      titre: r.titre,
      notation: r.notation,
      dateCritique: r.dateCritique?.toISOString?.() || r.dateCritique,
      mediaType,
      mediaTitle,
      mediaImage: image
        ? typeof image === 'string' && /^https?:\/\//.test(image)
          ? image
          : `/api/media/serve/${mediaType}/${image}`
        : null,
      anime: r.anime ? {
        id: r.anime.idAnime,
        titre: r.anime.titre,
        niceUrl: r.anime.niceUrl,
        image: r.anime.image,
      } : null,
      manga: r.manga ? {
        id: r.manga.idManga,
        titre: r.manga.titre,
        niceUrl: r.manga.niceUrl,
        image: r.manga.image,
      } : null,
      jeuxVideo: r.jeuxVideo ? {
        id: r.jeuxVideo.idJeu,
        titre: r.jeuxVideo.titre,
        niceUrl: r.jeuxVideo.niceUrl,
        image: r.jeuxVideo.image,
      } : null,
      membre: r.membre ? {
        id: r.membre.idMember || r.membre.id,
        pseudo: r.membre.memberName || r.membre.pseudo,
        avatar: r.membre.avatar,
      } : null,
    };
  }
}
