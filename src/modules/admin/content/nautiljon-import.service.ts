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
    
    // Store the full resources data in a separate field if the database supports it
    if (ressources && createdAnime.idAnime) {
      try {
        await this.prisma.akAnime.update({
          where: { idAnime: createdAnime.idAnime },
          data: { 
            commentaire: JSON.stringify(ressources) // Store in commentaire field as JSON
          },
        });
      } catch (error) {
        console.warn('Failed to store resources data:', error.message);
      }
    }

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
      const ressources = JSON.parse(anime.commentaire);
      
      const result = {
        staff: [],
        tags: [],
      };

      // Extract staff from resources
      if (ressources.staff) {
        result.staff = ressources.staff.map((member: any) => ({
          name: member.name,
          role: member.role,
          // Map role to system role
          mappedRole: this.mapStaffRole(member.role),
        }));
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
}