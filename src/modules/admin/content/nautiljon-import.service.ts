import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { 
  NautiljonImportDto, 
  NautiljonAnimeComparisonDto,
  CreateAnimeFromNautiljonDto 
} from './dto/nautiljon-import.dto';
import { CreateAdminAnimeDto } from './dto/admin-anime.dto';
import { AdminAnimesService } from './admin-animes.service';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class NautiljonImportService {
  constructor(
    private prisma: PrismaService,
    private adminAnimesService: AdminAnimesService,
  ) {}

  async importSeasonAnimes(importDto: NautiljonImportDto): Promise<NautiljonAnimeComparisonDto[]> {
    let htmlContent: string;

    if (importDto.isUrl) {
      // If URL provided, fetch the content
      try {
        const response = await fetch(importDto.htmlContentOrUrl);
        if (!response.ok) {
          throw new BadRequestException('Failed to fetch URL content');
        }
        htmlContent = await response.text();
      } catch (error) {
        throw new BadRequestException('Error fetching URL: ' + error.message);
      }
    } else {
      htmlContent = importDto.htmlContentOrUrl;
    }

    // Extract anime titles from HTML using the same logic as the script
    const animeList = this.extractAnimeTitlesFromHtml(htmlContent);
    
    // Compare with existing database
    const comparisons: NautiljonAnimeComparisonDto[] = [];
    
    for (const animeTitle of animeList) {
      const comparison = await this.compareAnimeWithDatabase(animeTitle);
      comparisons.push(comparison);
    }

    return comparisons;
  }

  private extractAnimeTitlesFromHtml(htmlContent: string): string[] {
    const titles: string[] = [];

    // Use regex to extract anime titles - simpler approach without JSDOM
    // Look for elements with class "elt" and extract h2 > a text content
    const eltMatches = htmlContent.match(/<div[^>]*class="[^"]*elt[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];
    
    eltMatches.forEach((eltHtml) => {
      // Extract title from h2 > a within title div
      const titleMatch = eltHtml.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      if (titleMatch && titleMatch[1]) {
        let title = titleMatch[1].trim();
        // Remove anything in parentheses
        title = title.replace(/\s*\([^)]*\)/g, '').trim();
        if (title && title.length > 0) {
          titles.push(title);
        }
      }
    });

    // If no .elt elements found, try alternative approach with h2 a tags
    if (titles.length === 0) {
      const h2Matches = htmlContent.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h2>/gi) || [];
      h2Matches.forEach((h2Html) => {
        const titleMatch = h2Html.match(/<a[^>]*>([^<]+)<\/a>/i);
        if (titleMatch && titleMatch[1]) {
          let title = titleMatch[1].trim();
          // Remove anything in parentheses
          title = title.replace(/\s*\([^)]*\)/g, '').trim();
          if (title && title.length > 0) {
            titles.push(title);
          }
        }
      });
    }

    return [...new Set(titles)]; // Remove duplicates
  }

  private async compareAnimeWithDatabase(title: string): Promise<NautiljonAnimeComparisonDto> {
    // Search for anime in database using multiple fields
    const existingAnime = await this.prisma.akAnime.findFirst({
      where: {
        OR: [
          { titre: { equals: title, mode: 'insensitive' } },
          { titreOrig: { equals: title, mode: 'insensitive' } },
          { titreFr: { equals: title, mode: 'insensitive' } },
          { titresAlternatifs: { contains: title, mode: 'insensitive' } },
        ],
      },
      select: {
        idAnime: true,
        titre: true,
        titreOrig: true,
        titreFr: true,
        titresAlternatifs: true,
      },
    });

    const comparison: NautiljonAnimeComparisonDto = {
      titre: title,
      exists: !!existingAnime,
      existingAnimeId: existingAnime?.idAnime,
    };

    // If anime doesn't exist, try to scrape additional data
    if (!existingAnime) {
      try {
        const scrapedData = await this.scrapeAnimeData(title);
        comparison.scrapedData = scrapedData;
        comparison.ressources = scrapedData; // Store in ressources column format
      } catch (error) {
        console.warn(`Failed to scrape data for ${title}:`, error.message);
      }
    }

    return comparison;
  }

  private async scrapeAnimeData(title: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = join(process.cwd(), '../script_ak/combined_script.py');
      const pythonProcess = spawn('python3', [scriptPath, title, '--output', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const jsonData = JSON.parse(stdout);
            resolve(jsonData);
          } catch (error) {
            reject(new Error('Failed to parse scraped JSON data'));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn python process: ${error.message}`));
      });

      // Set timeout for scraping
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Scraping timeout'));
      }, 60000); // 1 minute timeout
    });
  }

  async createAnimeFromNautiljon(
    createDto: CreateAnimeFromNautiljonDto,
    user?: any,
  ): Promise<any> {
    // Extract fields from resources data
    const ressources = createDto.ressources;
    
    // Build the admin anime creation DTO
    const adminDto: CreateAdminAnimeDto = {
      titre: createDto.titre,
      titreOrig: createDto.titreOrig,
      titre_fr: createDto.titreFr,
      titres_alternatifs: createDto.titresAlternatifs,
      // Default values
      annee: new Date().getFullYear(),
      statut: 0, // Pending approval
      commentaire: JSON.stringify(createDto.ressources), // Store resources as JSON string in commentaire field
    };

    // Extract additional data from ressources if available
    if (ressources) {
      // Extract year from various sources
      if (ressources.airing_info?.season) {
        const seasonMatch = ressources.airing_info.season.match(/(\d{4})/);
        if (seasonMatch) {
          adminDto.annee = parseInt(seasonMatch[1]);
        }
      }
      
      // Extract episode count
      if (ressources.episode_count) {
        adminDto.nb_epduree = String(ressources.episode_count);
      }
      
      // Extract synopsis
      if (ressources.synopsis) {
        adminDto.synopsis = ressources.synopsis;
      }
      
      // Extract studio
      if (ressources.studios && ressources.studios.length > 0) {
        adminDto.studio = ressources.studios[0];
      }
      
      // Extract official site
      if (ressources.official_websites && ressources.official_websites.length > 0) {
        adminDto.official_site = ressources.official_websites[0];
      }
    }

    // Create the anime
    const createdAnime = await this.adminAnimesService.create(adminDto);

    return createdAnime;
  }

  async getStaffAndTagsFromResources(animeId: number): Promise<any> {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { commentaire: true },
    });

    if (!anime || !anime.commentaire) {
      throw new BadRequestException('No resources data found for this anime');
    }

    try {
      // Use commentaire field to store/read resources JSON
      const resourcesText = anime.commentaire;
      const ressources = JSON.parse(resourcesText);

      const result = {
        staff: [],
        tags: [],
      };

      // Extract staff from resources with business entity matching
      if (ressources.staff) {
        const staffWithMatching = await Promise.all(
          ressources.staff.map(async (member: any) => {
            // Try to find existing business entity by denomination
            const existingBusiness = await this.prisma.akBusiness.findFirst({
              where: {
                denomination: {
                  equals: member.name,
                  mode: 'insensitive'
                }
              },
              select: {
                idBusiness: true,
                denomination: true,
                type: true
              }
            });

            return {
              name: member.name,
              role: member.role,
              mappedRole: this.mapStaffRole(member.role),
              existingBusiness,
              businessId: existingBusiness?.idBusiness || null,
              canImport: !!existingBusiness
            };
          })
        );

        result.staff = staffWithMatching;
      }

      // Extract genres and themes as tags
      if (ressources.genres) {
        result.tags = result.tags.concat(
          ressources.genres.map((genre: string) => ({
            name: genre,
            category: 'Genre',
          }))
        );
      }

      if (ressources.themes) {
        result.tags = result.tags.concat(
          ressources.themes.map((theme: string) => ({
            name: theme,
            category: 'Theme',
          }))
        );
      }

      return result;
    } catch (error) {
      throw new BadRequestException('Failed to parse resources data');
    }
  }

  private mapStaffRole(role: string): string {
    // Role mapping based on run_anime_automation.py patterns
    const roleMapping: { [key: string]: string } = {
      'Director': 'Réalisateur',
      'Series Director': 'Réalisateur',
      'Chief Director': 'Réalisateur',
      'Music': 'Compositeur',
      'Sound Director': 'Directeur du son',
      'Character Design': 'Character Design',
      'Art Director': 'Directeur artistique',
      'Animation Director': 'Directeur d\'animation',
      'Series Composition': 'Composition',
      'Script': 'Scénario',
      'Screenplay': 'Scénario',
      'Original Creator': 'Créateur original',
      'Original Story': 'Histoire originale',
      'Producer': 'Producteur',
      'Executive Producer': 'Producteur exécutif',
    };

    return roleMapping[role] || role;
  }

  async importStaffFromResources(animeId: number, staffToImport: Array<{ businessId: number, role: string }>): Promise<any> {
    try {
      const results = [];

      for (const staff of staffToImport) {
        // Check if relationship already exists
        const existing = await this.prisma.$queryRawUnsafe(
          `SELECT 1 FROM ak_business_to_animes WHERE id_anime = $1 AND id_business = $2 LIMIT 1`,
          animeId,
          staff.businessId
        );

        if ((existing as any[]).length > 0) {
          results.push({
            businessId: staff.businessId,
            status: 'skipped',
            message: 'Staff member already attached'
          });
          continue;
        }

        // Add staff relationship
        await this.prisma.$queryRawUnsafe(
          `INSERT INTO ak_business_to_animes (id_anime, id_business, type) VALUES ($1, $2, $3)`,
          animeId,
          staff.businessId,
          staff.role || null
        );

        results.push({
          businessId: staff.businessId,
          status: 'imported',
          message: 'Staff member imported successfully'
        });
      }

      return {
        imported: results.filter(r => r.status === 'imported').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        results
      };
    } catch (error) {
      throw new BadRequestException('Failed to import staff: ' + error.message);
    }
  }
}