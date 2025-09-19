import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CreateBusinessDto } from '../business/dto/create-business.dto';

export interface AniListAnime {
  id: number;
  title: {
    romaji: string;
    english?: string;
    native: string;
  };
  description?: string;
  seasonYear?: number;
  episodes?: number;
  duration?: number;
  format: string;
  status: string;
  startDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  endDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  coverImage: {
    large: string;
    medium: string;
  };
  bannerImage?: string;
  genres: string[];
  studios: {
    nodes: Array<{
      id: number;
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
  averageScore?: number;
  meanScore?: number;
  siteUrl: string;
}

export interface AniListManga {
  id: number;
  title: { romaji: string; english?: string; native: string };
  description?: string;
  startDate?: { year?: number; month?: number; day?: number };
  endDate?: { year?: number; month?: number; day?: number };
  coverImage: { large: string; medium: string };
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

  constructor(private readonly configService: ConfigService) {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
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

  mapToCreateAnimeDto(anilistAnime: AniListAnime): Partial<any> {
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
      image: anilistAnime.coverImage?.large || anilistAnime.coverImage?.medium,
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

      // If we got fewer results than requested, we've reached the end
      if (pageAnime.length < currentPageSize) break;
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
            staff(perPage: 25) {
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
    const authors = anilistManga.staff?.edges
      ?.filter(edge => {
        const role = (edge.role || '').toLowerCase();
        const occ = (edge.node.primaryOccupations || []).map(o => o.toLowerCase());
        return (
          role.includes('story') ||
          role.includes('original') ||
          role.includes('author') ||
          occ.includes('mangaka') ||
          occ.includes('author')
        );
      })
      ?.map(edge => edge.node.name.full)
      ?.join(', ') || '';

    const officialWebsite = anilistManga.externalLinks?.find(link =>
      link.site?.toLowerCase().includes('official') || link.type === 'INFO'
    )?.url || '';

    return {
      titre: anilistManga.title.romaji || anilistManga.title.english || anilistManga.title.native,
      annee: anilistManga.startDate?.year ? String(anilistManga.startDate.year) : undefined,
      synopsis: anilistManga.description,
      image: anilistManga.coverImage?.large || anilistManga.coverImage?.medium,
      auteur: authors,
      nbVolumes: anilistManga.volumes ? String(anilistManga.volumes) : undefined,
      statut: 0,
      commentaire: JSON.stringify({
        anilistId: anilistManga.id,
        originalData: {
          chapters: anilistManga.chapters,
          volumes: anilistManga.volumes,
          genres: anilistManga.genres,
          bannerImage: anilistManga.bannerImage,
          description: anilistManga.description,
          siteUrl: anilistManga.siteUrl,
          officialSite: officialWebsite,
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
}
