import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CreateBusinessDto } from '../business/dto/create-business.dto';
import { JikanService } from '../jikan/jikan.service';

export interface AniListAnime {
  id: number;
  idMal?: number;  // MyAnimeList ID for cross-referencing
  title: {
    romaji: string;
    english?: string;
    native: string;
  };
  synonyms?: string[];  // Alternative titles
  description?: string;
  coverImage: {
    extraLarge: string;
    large: string;
    medium: string;
  };
  bannerImage: string | null;
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  endDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  duration: number | null;
  format: string | null;
  status: string | null;
  genres: string[];
  averageScore: number | null;
  popularity: number;
  studios: {
    nodes: Array<{
      name: string;
      isAnimationStudio: boolean;
    }>;
  };
  staff: {
    edges: Array<{
      id: number;
      role: string;
      node: {
        id: number;
        name: {
          full: string;
        };
        primaryOccupations: string[];
      };
    }>;
  };
  characters: {
    edges: Array<{
      id: number;
      role: string;
      node: {
        id: number;
        name: {
          full: string;
        };
        image: {
          large: string;
        };
      };
      voiceActors: Array<{
        id: number;
        name: {
          full: string;
        };
        language: string;
        image: {
          large: string;
        };
      }>;
    }>;
  };
  externalLinks: Array<{
    id: number;
    type: string;
    site: string;
    url: string;
  }>;
  meanScore?: number;
  siteUrl: string;
}

export interface AniListManga {
  id: number;
  title: { romaji: string; english?: string; native: string };
  description?: string;
  startDate?: { year?: number; month?: number; day?: number };
  endDate?: { year?: number; month?: number; day?: number };
  coverImage: { extraLarge?: string; large: string; medium: string };
  bannerImage?: string;
  genres: string[];
  chapters?: number;
  volumes?: number;
  staff: {
    edges: Array<{
      id: number;
      role: string;
      node: { id: number; name: { full: string }; primaryOccupations: string[] };
    }>;
  };
  externalLinks: Array<{ id: number; type: string; site: string; url: string }>;
  averageScore?: number;
  meanScore?: number;
  siteUrl: string;
}

export interface AniListSearchResult {
  data: {
    Page: {
      media: AniListAnime[];
    };
  };
}

export interface AniListStaff {
  id: number;
  name: {
    full: string;
    native?: string;
  };
  image: {
    large: string;
    medium: string;
  };
  description?: string;
  primaryOccupations: string[];
  dateOfBirth?: {
    year?: number;
    month?: number;
    day?: number;
  };
  homeTown?: string;
  bloodType?: string;
  siteUrl: string;
}

export interface AniListStudio {
  id: number;
  name: string;
  isAnimationStudio: boolean;
  favourites: number;
  siteUrl: string;
  media?: {
    nodes: Array<{
      id: number;
      title: {
        romaji: string;
        english?: string;
        native: string;
      };
      coverImage: {
        large: string;
        medium: string;
      };
      type: string;
      format?: string;
      status?: string;
      season?: string;
      seasonYear?: number;
      averageScore?: number;
      popularity: number;
      episodes?: number;
    }>;
    pageInfo: {
      total: number;
      perPage: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
    };
  };
}

export interface AniListStaffSearchResult {
  data: {
    Page: {
      staff: AniListStaff[];
    };
  };
}

export interface AniListStudioSearchResult {
  data: {
    Page: {
      studios: AniListStudio[];
    };
  };
}

@Injectable()
export class AniListService {
  private readonly logger = new Logger(AniListService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl = 'https://graphql.anilist.co';

  constructor(
    private readonly configService: ConfigService,
    private readonly jikanService: JikanService,
  ) {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // Increased to 60 seconds for seasonal imports
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  async searchAnime(query: string, limit = 10): Promise<AniListAnime[]> {
    const graphqlQuery = `
      query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(search: $search, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            description
            seasonYear
            episodes
            duration
            format
            status
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            coverImage {
              extraLarge
              large
              medium
            }
            bannerImage
            genres
            studios {
              nodes {
                id
                name
                isAnimationStudio
              }
            }
            staff(perPage: 20) {
              edges {
                id
                role
                node {
                  id
                  name {
                    full
                  }
                  primaryOccupations
                }
              }
            }
            characters(perPage: 20, sort: [ROLE, RELEVANCE, ID]) {
              edges {
                id
                role
                node {
                  id
                  name {
                    full
                  }
                  image {
                    large
                  }
                }
                voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
                  id
                  name {
                    full
                  }
                  language
                  image {
                    large
                  }
                }
              }
            }
            externalLinks {
              id
              type
              site
              url
            }
            averageScore
            meanScore
            siteUrl
          }
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          search: query,
          perPage: limit,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to search anime on AniList');
      }

      return response.data.data.Page.media;
    } catch (error) {
      this.logger.error('Error searching anime on AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }

  async getAnimeById(anilistId: number): Promise<AniListAnime | null> {
    const graphqlQuery = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          description
          seasonYear
          episodes
          duration
          format
          status
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          coverImage {
            large
            medium
          }
          bannerImage
          genres
          studios {
            nodes {
              id
              name
              isAnimationStudio
            }
          }
          staff(perPage: 30) {
            edges {
              id
              role
              node {
                id
                name {
                  full
                }
                primaryOccupations
              }
            }
          }
          characters(perPage: 25, sort: [ROLE, RELEVANCE, ID]) {
            edges {
              id
              role
              node {
                id
                name {
                  full
                }
                image {
                  large
                }
              }
              voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
                id
                name {
                  full
                }
                language
                image {
                  large
                }
              }
            }
          }
          externalLinks {
            id
            type
            site
            url
          }
          averageScore
          meanScore
          siteUrl
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          id: anilistId,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        return null;
      }

      return response.data.data.Media;
    } catch (error) {
      this.logger.error('Error fetching anime from AniList:', error.message);
      return null;
    }
  }

  async mapToCreateAnimeDto(anilistAnime: AniListAnime): Promise<Partial<any>> {
    const studios = anilistAnime.studios?.nodes
      ?.filter(studio => studio.isAnimationStudio)
      ?.map(studio => studio.name)
      ?.join(', ') || '';

    const directors = anilistAnime.staff?.edges
      ?.filter(staff => staff.role?.toLowerCase().includes('director') || staff.node.primaryOccupations?.includes('Director'))
      ?.map(staff => staff.node.name.full)
      ?.join(', ') || '';

    const staffData = anilistAnime.staff?.edges?.map(staff => ({
      name: staff.node.name.full,
      role: staff.role,
      primaryOccupations: staff.node.primaryOccupations,
    })) || [];

    const charactersData = anilistAnime.characters?.edges?.map(char => ({
      name: char.node.name.full,
      role: char.role,
      image: char.node.image.large,
      voiceActors: char.voiceActors?.map(va => ({
        name: va.name.full,
        language: va.language,
        image: va.image.large,
      })) || [],
    })) || [];

    const officialWebsite = anilistAnime.externalLinks?.find(link =>
      link.site?.toLowerCase().includes('official') ||
      link.type === 'INFO'
    )?.url || '';

    // Try to fetch better quality image from Jikan/MyAnimeList
    let imageUrl = anilistAnime.coverImage?.extraLarge || anilistAnime.coverImage?.large || anilistAnime.coverImage?.medium;
    try {
      const title = anilistAnime.title.romaji || anilistAnime.title.english || anilistAnime.title.native;
      const year = anilistAnime.seasonYear || anilistAnime.startDate?.year;

      const jikanAnime = await this.jikanService.findBestMatch(title, year);
      if (jikanAnime) {
        const jikanImageUrl = this.jikanService.getBestImageUrl(jikanAnime);
        if (jikanImageUrl) {
          imageUrl = jikanImageUrl;
          this.logger.log(`Using Jikan image for "${title}" (better quality)`);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to fetch Jikan image, using AniList image:', error.message);
    }

    return {
      titre: anilistAnime.title.romaji || anilistAnime.title.english || anilistAnime.title.native,
      titreOrig: anilistAnime.title.native,
      titreFr: anilistAnime.title.english,
      titresAlternatifs: [
        anilistAnime.title.romaji,
        anilistAnime.title.english,
        anilistAnime.title.native,
      ]
        .filter(Boolean)
        .filter((title, index, arr) => arr.indexOf(title) === index)
        .join('\n'),
      annee: anilistAnime.seasonYear || anilistAnime.startDate?.year,
      dateDiffusion: this.formatDate(anilistAnime.startDate),
      image: imageUrl,
      nbEp: anilistAnime.episodes,
      studio: studios,
      realisateur: directors,
      format: this.mapFormat(anilistAnime.format),
      officialSite: officialWebsite,
      statut: 0, // Default to pending approval
      commentaire: JSON.stringify({
        anilistId: anilistAnime.id,
        originalData: {
          format: anilistAnime.format,
          status: anilistAnime.status,
          duration: anilistAnime.duration,
          genres: anilistAnime.genres,
          averageScore: anilistAnime.averageScore,
          meanScore: anilistAnime.meanScore,
          bannerImage: anilistAnime.bannerImage,
          description: anilistAnime.description,
        },
        staff: staffData,
        characters: charactersData,
      }),
    };
  }

  async getAnimesBySeason(season: string, year: number, limit = 50): Promise<AniListAnime[]> {
    const maxPerPage = 50; // AniList API limit
    const totalPages = Math.ceil(limit / maxPerPage);
    const allAnime: AniListAnime[] = [];

    for (let page = 1; page <= totalPages; page++) {
      const remainingItems = limit - allAnime.length;
      const currentPageSize = Math.min(maxPerPage, remainingItems);

      if (currentPageSize <= 0) break;

      const pageAnime = await this.getAnimesPage(season, year, page, currentPageSize);
      allAnime.push(...pageAnime);

      this.logger.log(`Fetched page ${page}/${totalPages} - ${pageAnime.length} animes (total: ${allAnime.length}/${limit})`);

      // If we got fewer results than requested, we've reached the end
      if (pageAnime.length < currentPageSize) break;

      // Add delay between requests to avoid rate limiting (except for last page)
      if (page < totalPages && allAnime.length < limit) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return allAnime.slice(0, limit);
  }

  private async getAnimesPage(season: string, year: number, page: number, perPage: number): Promise<AniListAnime[]> {
    const graphqlQuery = `
      query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(season: $season, seasonYear: $year, type: ANIME, sort: [POPULARITY_DESC]) {
            id
            title {
              romaji
              english
              native
            }
            description
            seasonYear
            episodes
            duration
            format
            status
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            coverImage {
              extraLarge
              large
              medium
            }
            bannerImage
            genres
            studios {
              nodes {
                id
                name
                isAnimationStudio
              }
            }
            staff(perPage: 10) {
              edges {
                id
                role
                node {
                  id
                  name {
                    full
                  }
                  primaryOccupations
                }
              }
            }
            characters(perPage: 10, sort: [ROLE, RELEVANCE, ID]) {
              edges {
                id
                role
                node {
                  id
                  name {
                    full
                  }
                  image {
                    large
                  }
                }
                voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
                  id
                  name {
                    full
                  }
                  language
                  image {
                    large
                  }
                }
              }
            }
            externalLinks {
              id
              type
              site
              url
            }
            averageScore
            meanScore
            siteUrl
          }
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          season: season.toUpperCase(),
          year: year,
          page: page,
          perPage: perPage,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to get seasonal anime from AniList');
      }

      return response.data.data.Page.media;
    } catch (error) {
      this.logger.error('Error fetching seasonal anime from AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }

  async searchStaff(query: string, limit = 10): Promise<AniListStaff[]> {
    const graphqlQuery = `
      query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          staff(search: $search) {
            id
            name {
              full
              native
            }
            image {
              large
              medium
            }
            description
            primaryOccupations
            dateOfBirth {
              year
              month
              day
            }
            homeTown
            bloodType
            siteUrl
          }
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          search: query,
          perPage: limit,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to search staff on AniList');
      }

      return response.data.data.Page.staff;
    } catch (error) {
      this.logger.error('Error searching staff on AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }

  async searchStudios(query: string, limit = 10): Promise<AniListStudio[]> {
    const graphqlQuery = `
      query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          studios(search: $search) {
            id
            name
            isAnimationStudio
            favourites
            siteUrl
            media(sort: POPULARITY_DESC, page: 1, perPage: 10, isMain: true) {
              nodes {
                id
                title {
                  romaji
                  english
                  native
                }
                coverImage {
                  large
                  medium
                }
                type
                format
                status
                season
                seasonYear
                averageScore
                popularity
                episodes
              }
              pageInfo {
                total
                perPage
                currentPage
                lastPage
                hasNextPage
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          search: query,
          perPage: limit,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to search studios on AniList');
      }

      return response.data.data.Page.studios;
    } catch (error) {
      this.logger.error('Error searching studios on AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }

  /**
   * Sanitize a string using Buffer to properly handle binary null bytes
   */
  private sanitizeStringBuffer(str: string): string {
    const buffer = Buffer.from(str, 'utf8');
    const cleanedBytes: number[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      // Skip null bytes (0x00) and other problematic control characters
      if (byte === 0x00) continue;
      if (byte >= 0x01 && byte <= 0x08) continue;
      if (byte === 0x0B || byte === 0x0C) continue;
      if (byte >= 0x0E && byte <= 0x1F) continue;
      cleanedBytes.push(byte);
    }
    return Buffer.from(cleanedBytes).toString('utf8');
  }

  /**
   * Recursively sanitize all strings in an object to remove null bytes
   * that cause PostgreSQL UTF-8 encoding errors
   */
  private sanitizeDeep(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      return this.sanitizeStringBuffer(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeDeep(item));
    }
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeDeep(value);
      }
      return sanitized;
    }
    return obj;
  }

  async getAiringSchedule(anilistId: number, start?: number, end?: number): Promise<any[]> {
    const graphqlQuery = `
      query ($mediaId: Int, $start: Int, $end: Int) {
        Page(page: 1, perPage: 50) {
          airingSchedules(mediaId: $mediaId, airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
            id
            episode
            airingAt
            media {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                large
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          mediaId: anilistId,
          start: start || undefined,
          end: end || undefined,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to get airing schedule from AniList');
      }

      // Sanitize the response to remove any null bytes that would cause PostgreSQL errors
      const schedules = response.data.data.Page.airingSchedules;

      // Log raw data for debugging
      this.logger.log(`Received ${schedules?.length || 0} airing schedules from AniList`);
      if (schedules?.[0]?.media?.title?.native) {
        const rawTitle = schedules[0].media.title.native;
        const hex = Buffer.from(rawTitle, 'utf8').toString('hex');
        this.logger.log(`First episode raw native title hex: ${hex}`);
      }

      const sanitized = this.sanitizeDeep(schedules);

      // Verify sanitization
      if (sanitized?.[0]?.media?.title?.native) {
        const cleanTitle = sanitized[0].media.title.native;
        const cleanHex = Buffer.from(cleanTitle, 'utf8').toString('hex');
        this.logger.log(`First episode sanitized native title hex: ${cleanHex}`);
      }

      return sanitized;
    } catch (error) {
      this.logger.error('Error fetching airing schedule from AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }

  mapStaffToCreateBusinessDto(anilistStaff: AniListStaff): CreateBusinessDto {
    return {
      denomination: anilistStaff.name.full,
      autresDenominations: anilistStaff.name.native || anilistStaff.name.full,
      type: 'Personne',
      image: anilistStaff.image?.large || anilistStaff.image?.medium,
      notes: anilistStaff.description,
      siteOfficiel: anilistStaff.siteUrl,
    };
  }

  mapStudioToCreateBusinessDto(anilistStudio: AniListStudio): CreateBusinessDto {
    return {
      denomination: anilistStudio.name,
      type: 'Studio',
      siteOfficiel: anilistStudio.siteUrl,
    };
  }

  async searchManga(query: string, limit = 10): Promise<AniListManga[]> {
    const graphqlQuery = `
      query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(search: $search, type: MANGA) {
            id
            title { romaji english native }
            description
            startDate { year month day }
            endDate { year month day }
            coverImage { large medium }
            bannerImage
            genres
            chapters
            volumes
            staff(perPage: 30) {
              edges {
                id
                role
                node { id name { full } primaryOccupations }
              }
            }
            externalLinks { id type site url }
            averageScore
            meanScore
            siteUrl
          }
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: { search: query, perPage: limit },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to search manga on AniList');
      }

      return response.data.data.Page.media;
    } catch (error: any) {
      this.logger.error('Error searching manga on AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }

  async getMangaById(anilistId: number): Promise<AniListManga | null> {
    const graphqlQuery = `
      query ($id: Int) {
        Media(id: $id, type: MANGA) {
          id
          title { romaji english native }
          description
          startDate { year month day }
          endDate { year month day }
          coverImage { large medium }
          bannerImage
          genres
          chapters
          volumes
          staff(perPage: 50) {
            edges {
              id
              role
              node { id name { full } primaryOccupations }
            }
          }
          externalLinks { id type site url }
          averageScore
          meanScore
          siteUrl
        }
      }
    `;

    try {
      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: { id: anilistId },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        return null;
      }

      return response.data.data.Media;
    } catch (error: any) {
      this.logger.error('Error fetching manga from AniList:', error.message);
      return null;
    }
  }

  mapToCreateMangaDto(anilistManga: AniListManga): Partial<any> {
    // Map staff roles to traditional functions
    const staffMapping = (anilistManga.staff?.edges || []).reduce((acc: any, edge: any) => {
      const role = String(edge.role || '').toLowerCase();
      const name = edge.node?.name?.full;
      const occupations = (edge.node.primaryOccupations || []).map((o: string) => o.toLowerCase());

      if (!name) return acc;

      // Map to traditional functions
      if (role.includes('story') || role.includes('original creator') || occupations.includes('author')) {
        if (!acc.auteur) acc.auteur = [];
        if (role.includes('original') || occupations.includes('author')) {
          acc.auteur.push({ name, role: 'Auteur' });
        } else {
          acc.auteur.push({ name, role: 'Scénariste' });
        }
      } else if (role.includes('art') || occupations.includes('mangaka') || occupations.includes('artist')) {
        if (!acc.dessinateur) acc.dessinateur = [];
        acc.dessinateur.push({ name, role: 'Dessinateur' });
      } else if (role.includes('assistant')) {
        if (!acc.assistance) acc.assistance = [];
        acc.assistance.push({ name, role: 'Assistance' });
      }

      return acc;
    }, {});

    // Get publisher from external links or staff
    const publishers = (anilistManga.staff?.edges || [])
      .filter((edge: any) => {
        const role = String(edge.role || '').toLowerCase();
        return role.includes('publisher') || role.includes('serialization');
      })
      .map((edge: any) => edge.node?.name?.full)
      .filter(Boolean);

    // Get official website (not AniList URL)
    const officialWebsite = (anilistManga.externalLinks || [])
      .find((link: any) =>
        link.site?.toLowerCase().includes('official') ||
        link.type === 'INFO' ||
        link.site?.toLowerCase().includes('website')
      )?.url || '';

    const staffData = {
      ...staffMapping,
      ...(publishers.length > 0 && { publisher: publishers })
    };

    return {
      titre: anilistManga.title.romaji || anilistManga.title.english || anilistManga.title.native,
      titreOriginal: anilistManga.title.native,
      titreFrancais: anilistManga.title.english,
      titresAlternatifs: [
        anilistManga.title.native,
        anilistManga.title.romaji,
        anilistManga.title.english,
      ]
        .filter(Boolean)
        .filter((title, index, arr) => arr.indexOf(title) === index)
        .join('\n'),
      annee: anilistManga.startDate?.year ? String(anilistManga.startDate.year) : undefined,
      image: anilistManga.coverImage?.extraLarge || anilistManga.coverImage?.large || anilistManga.coverImage?.medium,
      nbVolumes: anilistManga.volumes ? String(anilistManga.volumes) : undefined,
      siteOfficiel: officialWebsite,
      statut: 0,
      commentaire: JSON.stringify({
        anilistId: anilistManga.id,
        source: 'AniList',
        genres: anilistManga.genres,
        score: anilistManga.averageScore,
        staff: staffData,
        originalData: {
          chapters: anilistManga.chapters,
          volumes: anilistManga.volumes,
          bannerImage: anilistManga.bannerImage,
          siteUrl: anilistManga.siteUrl,
          officialWebsite,
        },
      }),
    };
  }

  private mapFormat(anilistFormat: string): string {
    const formatMap: Record<string, string> = {
      'TV': 'Série TV',
      'TV_SHORT': 'Série TV',
      'MOVIE': 'Film',
      'SPECIAL': 'Spécial',
      'OVA': 'OVA',
      'ONA': 'ONA',
      'MUSIC': 'Clip musical',
    };

    return formatMap[anilistFormat] || 'Série TV';
  }

  private formatDate(date?: { year?: number; month?: number; day?: number }): string | null {
    if (!date?.year) return null;

    // Build date string in YYYY-MM-DD format for PostgreSQL DATE type
    const year = date.year;
    const month = date.month ? String(date.month).padStart(2, '0') : '01';
    const day = date.day ? String(date.day).padStart(2, '0') : '01';

    return `${year}-${month}-${day}`;
  }

  async getMangasByDateRange(startDate: string, endDate: string, limit = 50): Promise<AniListManga[]> {
    const maxPerPage = 50; // AniList API limit
    const totalPages = Math.ceil(limit / maxPerPage);
    const allManga: AniListManga[] = [];

    for (let page = 1; page <= totalPages; page++) {
      const remainingItems = limit - allManga.length;
      const currentPageSize = Math.min(maxPerPage, remainingItems);

      if (currentPageSize <= 0) break;

      const pageManga = await this.getMangasPage(startDate, endDate, page, currentPageSize);
      allManga.push(...pageManga);

      // If we got fewer results than requested, we've reached the end
      if (pageManga.length < currentPageSize) break;
    }

    return allManga.slice(0, limit);
  }

  private async getMangasPage(startDate: string, endDate: string, page: number, perPage: number): Promise<AniListManga[]> {
    const graphqlQuery = `
      query ($startDateGreater: FuzzyDateInt, $startDateLesser: FuzzyDateInt, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(
            startDate_greater: $startDateGreater,
            startDate_lesser: $startDateLesser,
            type: MANGA,
            sort: [POPULARITY_DESC]
          ) {
            id
            title { romaji english native }
            description
            startDate { year month day }
            endDate { year month day }
            coverImage { large medium }
            bannerImage
            genres
            chapters
            volumes
            staff(perPage: 30) {
              edges {
                id
                role
                node { id name { full } primaryOccupations }
              }
            }
            externalLinks { id type site url }
            averageScore
            meanScore
            siteUrl
          }
        }
      }
    `;

    try {
      // Convert YYYY-MM-DD to fuzzy date format (YYYYMMDD as integer)
      const startFuzzy = parseInt(startDate.replace(/-/g, ''));
      const endFuzzy = parseInt(endDate.replace(/-/g, ''));

      const response = await this.httpClient.post('', {
        query: graphqlQuery,
        variables: {
          startDateGreater: startFuzzy,
          startDateLesser: endFuzzy,
          page: page,
          perPage: perPage,
        },
      });

      if (response.data.errors) {
        this.logger.error('AniList API returned errors:', response.data.errors);
        throw new Error('Failed to get manga by date range from AniList');
      }

      return response.data.data.Page.media;
    } catch (error: any) {
      this.logger.error('Error fetching manga by date range from AniList:', error.message);
      throw new Error('Failed to connect to AniList API');
    }
  }
}
