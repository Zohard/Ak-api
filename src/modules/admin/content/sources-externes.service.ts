import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import {
  SourcesExternesImportDto,
  SourcesExternesAnimeComparisonDto,
  CreateAnimeFromSourcesExternesDto
} from './dto/sources-externes.dto';
import { CreateAdminAnimeDto } from './dto/admin-anime.dto';
import { AdminAnimesService } from './admin-animes.service';
import { ImageKitService } from '../../media/imagekit.service';
import { DeepLService } from '../../../shared/services/deepl.service';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class SourcesExternesService {
  constructor(
    private prisma: PrismaService,
    private adminAnimesService: AdminAnimesService,
    private imageKitService: ImageKitService,
    private deepLService: DeepLService,
  ) {}

  async importSeasonAnimes(importDto: SourcesExternesImportDto): Promise<SourcesExternesAnimeComparisonDto[]> {
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
    const comparisons: SourcesExternesAnimeComparisonDto[] = [];
    
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

    eltMatches.forEach((eltHtml: string) => {
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
      h2Matches.forEach((h2Html: string) => {
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

  private async compareAnimeWithDatabase(title: string): Promise<SourcesExternesAnimeComparisonDto> {
    // Normalize title for better matching: remove extra spaces, special chars
    const normalizedTitle = title.trim();

    console.log(`[Title Matching Debug] Original title: "${title}"`);

    // Create variations of the title for better matching
    const titleVariations = [
      normalizedTitle,
      normalizedTitle.replace(/\s+/g, ' '), // Normalize spaces
      normalizedTitle.replace(/[^\w\s]/g, ''), // Remove special chars
      normalizedTitle.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' '), // Remove special chars and normalize spaces

      // Season variations
      normalizedTitle.replace(/2nd\s+Season/gi, 'Season 2'),
      normalizedTitle.replace(/2nd\s+Season/gi, '2nd'),
      normalizedTitle.replace(/2nd\s+Season/gi, '2'),
      normalizedTitle.replace(/Season\s*2/gi, '2nd Season'),
      normalizedTitle.replace(/Season\s*2/gi, '2nd'),
      normalizedTitle.replace(/Season\s*2/gi, '2'),
      normalizedTitle.replace(/2nd/gi, 'Season 2'),
      normalizedTitle.replace(/2nd/gi, '2'),

      normalizedTitle.replace(/:\s*/g, ' '), // Replace colons with spaces
      normalizedTitle.replace(/\s*-\s*/g, ' '), // Replace dashes with spaces
    ];

    // Remove duplicates from variations
    const uniqueVariations = [...new Set(titleVariations)];

    console.log(`[Title Matching Debug] Generated ${uniqueVariations.length} variations:`, uniqueVariations.slice(0, 5));

    // Search for anime in database using multiple fields with flexible matching
    const existingAnime = await this.prisma.akAnime.findFirst({
      where: {
        OR: [
          // Exact matches with any title variation on all title fields
          ...uniqueVariations.flatMap(variation => [
            { titre: { equals: variation, mode: 'insensitive' as const } },
            { titreOrig: { equals: variation, mode: 'insensitive' as const } },
            { titreFr: { equals: variation, mode: 'insensitive' as const } },
          ]),
          // Contains matches for alternative titles (handles comma-separated lists)
          ...uniqueVariations.map(variation => ({
            titresAlternatifs: { contains: variation, mode: 'insensitive' as const }
          })),
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

    if (existingAnime) {
      console.log(`[Title Matching Debug] MATCH FOUND for "${title}":`, {
        id: existingAnime.idAnime,
        titre: existingAnime.titre,
        titreOrig: existingAnime.titreOrig,
        titreFr: existingAnime.titreFr,
      });
    } else {
      console.log(`[Title Matching Debug] NO MATCH for "${title}"`);
    }

    const comparison: SourcesExternesAnimeComparisonDto = {
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

  async importAnimeImage(
    imageUrl: string,
    animeTitle: string
  ): Promise<{ success: boolean; imageKitUrl?: string; filename?: string; error?: string }> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        return { success: false, error: 'No image URL provided' };
      }

      // Generate a clean filename from the anime title
      const cleanTitle = animeTitle
        .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .toLowerCase();

      const result = await this.imageKitService.uploadImageFromUrl(
        imageUrl,
        `${cleanTitle}_poster`,
        'images/animes'
      );

      return {
        success: true,
        imageKitUrl: result.url,
        filename: result.filename, // Store the filename for database
      };
    } catch (error) {
      console.warn('Failed to import anime image:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createAnimeFromNautiljon(
    createDto: CreateAnimeFromSourcesExternesDto,
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

    // Add Nautiljon title to alternative titles if it's different from the main title
    if (ressources?.nautiljon?.title && ressources.nautiljon.title !== createDto.titre) {
      const currentAltTitles = createDto.titresAlternatifs ? createDto.titresAlternatifs.split(',').map(t => t.trim()) : [];

      // Only add if not already present
      if (!currentAltTitles.includes(ressources.nautiljon.title)) {
        currentAltTitles.push(ressources.nautiljon.title);
        adminDto.titres_alternatifs = currentAltTitles.join(', ');
      }
    }

    // Extract additional data from ressources if available
    if (ressources) {
      // Extract year from various sources
      if (ressources.airing_info?.season) {
        const seasonMatch = ressources.airing_info.season.match(/(\d{4})/);
        if (seasonMatch) {
          adminDto.annee = parseInt(seasonMatch[1]);
        }
      }

      // Extract episode count (use 'NC' if not available or "Unknown")
      adminDto.nb_epduree = (ressources.episode_count && ressources.episode_count !== 'Unknown')
        ? String(ressources.episode_count)
        : 'NC';

      // Skip synopsis due to copyright concerns

      // Extract studio
      if (ressources.studios && ressources.studios.length > 0) {
        adminDto.studio = ressources.studios[0];
      }

      // Extract official site
      if (ressources.official_websites && ressources.official_websites.length > 0) {
        adminDto.official_site = ressources.official_websites[0];
      }
    }

    // Try to import image if available
    let imageImportResult: { success: boolean; imageKitUrl?: string; filename?: string; error?: string } | null = null;
    if (ressources?.merged?.image_url || ressources?.mal?.image_url || ressources?.nautiljon?.image_url) {
      // Prioritize MAL image, fallback to Nautiljon
      const imageUrl = ressources.merged?.image_url || ressources.mal?.image_url || ressources.nautiljon?.image_url;

      try {
        imageImportResult = await this.importAnimeImage(imageUrl, createDto.titre);

        if (imageImportResult && imageImportResult.success) {
          // Store the filename (not the full URL) in the database
          adminDto.image = imageImportResult.filename || imageImportResult.imageKitUrl;
        }
      } catch (error) {
        console.warn('Failed to import image during anime creation:', error.message);
      }
    }

    // Create the anime
    const createdAnime = await this.adminAnimesService.create(adminDto);

    // Add image import result to response
    const result = {
      ...createdAnime,
      imageImport: imageImportResult,
    };

    return result;
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

      const result: {
        staff: any[];
        characters: any[];
        tags: { name: string; category: string; }[];
      } = {
        staff: [],
        characters: [],
        tags: [],
      };

      // Extract characters and voice actors separately
      const charactersSources = [
        ressources.merged?.staff,
        ressources.mal?.staff,
        ressources.nautiljon?.staff,
        ressources.staff
      ].filter(Boolean);

      // Separate characters (Main/Supporting) from production staff
      const allCharacters: Array<{ name: string; role: string; voice_actors?: any[] }> = [];
      const allProductionStaff: Array<{ name: string; role: string }> = [];

      for (const staffArray of charactersSources) {
        if (Array.isArray(staffArray)) {
          staffArray.forEach(member => {
            if (member.role === 'Main' || member.role === 'Supporting') {
              // This is a character
              allCharacters.push(member);
            } else {
              // This is production staff
              allProductionStaff.push(member);
            }
          });
        }
      }

      // Process characters with Japanese voice actors only
      if (allCharacters.length > 0) {
        const charactersWithVoiceActors = allCharacters.map(character => {
          const japaneseVoiceActors = character.voice_actors
            ? character.voice_actors.filter(va => va.language === 'Japanese')
            : [];

          return {
            character: {
              name: character.name,
              role: character.role,
            },
            japaneseVoiceActors: japaneseVoiceActors.map(va => ({
              name: va.name,
              language: va.language
            }))
          };
        }).filter(item => item.japaneseVoiceActors.length > 0);

        result.characters = charactersWithVoiceActors;
      }

      // Extract production staff from nested structure (merged > mal > nautiljon priority)
      const staffSources = [
        ressources.merged?.staff,
        ressources.mal?.staff,
        ressources.nautiljon?.staff,
        ressources.staff // fallback to direct staff property
      ].filter(Boolean);

      // Use production staff from the separation above
      const allStaff: Array<{ name: string; role: string }> = [...allProductionStaff];

      // Add studios as staff
      const studioSources = [
        ressources.merged?.studios,
        ressources.mal?.studios,
        ressources.nautiljon?.studio ? [ressources.nautiljon.studio] : null,
        ressources.studios
      ].filter(Boolean);

      for (const studios of studioSources) {
        if (Array.isArray(studios)) {
          studios.forEach(studio => {
            if (studio) {
              allStaff.push({
                name: studio,
                role: 'Studio d\'animation'
              });
            }
          });
        }
      }

      // Remove duplicates and match with business entities
      if (allStaff.length > 0) {
        const uniqueStaff = new Map();
        allStaff.forEach(member => {
          const key = `${member.name?.toLowerCase() || ''}|${member.role?.toLowerCase() || ''}`;
          if (!uniqueStaff.has(key) && member.name) {
            uniqueStaff.set(key, member);
          }
        });

        const staffWithMatching = await Promise.all(
          Array.from(uniqueStaff.values()).map(async (member: any) => {
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

      // Extract genres and themes from nested structure (merged > nautiljon > mal priority)
      const genreSources = [
        ressources.merged?.genres,
        ressources.nautiljon?.genres,
        ressources.mal?.genres,
        ressources.genres
      ].filter(Boolean);

      const allGenres = new Set();
      genreSources.forEach(genres => {
        if (Array.isArray(genres)) {
          genres.forEach(genre => allGenres.add(genre));
        }
      });

      const tagMapping = this.getTagMapping();

      result.tags = result.tags.concat(
        Array.from(allGenres).map((genre: string) => ({
          name: genre,
          category: 'Genre',
          tagMapping: tagMapping[genre] || null,
        }))
      );

      const themeSources = [
        ressources.merged?.themes,
        ressources.nautiljon?.themes,
        ressources.mal?.themes,
        ressources.themes
      ].filter(Boolean);

      const allThemes = new Set();
      themeSources.forEach(themes => {
        if (Array.isArray(themes)) {
          themes.forEach(theme => allThemes.add(theme));
        }
      });

      result.tags = result.tags.concat(
        Array.from(allThemes).map((theme: string) => ({
          name: theme,
          category: 'Theme',
          tagMapping: tagMapping[theme] || null,
        }))
      );

      return result;
    } catch (error) {
      throw new BadRequestException('Failed to parse resources data');
    }
  }

  async getCharactersAsHtml(animeId: number): Promise<{ html: string }> {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { commentaire: true },
    });

    if (!anime || !anime.commentaire) {
      throw new BadRequestException('No resources data found for this anime');
    }

    try {
      const resourcesText = anime.commentaire;
      const ressources = JSON.parse(resourcesText);

      // Extract characters from merged, mal, nautiljon sources
      const charactersSources = [
        ressources.merged?.staff,
        ressources.mal?.staff,
        ressources.nautiljon?.staff,
        ressources.staff
      ].filter(Boolean);

      const allCharacters: Array<{ name: string; role: string; voice_actors?: any[] }> = [];

      for (const staffArray of charactersSources) {
        if (Array.isArray(staffArray)) {
          staffArray.forEach(member => {
            if (member.role === 'Main' || member.role === 'Supporting') {
              allCharacters.push(member);
            }
          });
        }
      }

      let htmlRows = '';

      if (allCharacters.length > 0) {
        allCharacters.forEach(character => {
          const japaneseVoiceActors = character.voice_actors
            ? character.voice_actors.filter(va => va.language === 'Japanese')
            : [];

          // Only include characters that have Japanese voice actors
          if (japaneseVoiceActors.length > 0) {
            japaneseVoiceActors.forEach(voiceActor => {
              htmlRows += `
    <tr>
      <td valign="top" width="27" class="ac borderClass">
        <div class="picSurround">
          <a href="#" class="fw-n">
            <img alt="${character.name}" width="42" height="62" src="https://via.placeholder.com/42x62/cccccc/ffffff?text=No+Image" />
          </a>
        </div>
      </td>
      <td valign="top" class="borderClass">
        <h3 class="h3_characters_voice_actors"><a href="#">${character.name}</a></h3>
        <div class="spaceit_pad">
          <small>${character.role}</small>
        </div>
      </td>
      <td align="right" valign="top" class="borderClass">
        <table border="0" cellpadding="0" cellspacing="0"><tbody><tr>
        <td class="va-t ar pl4 pr4">
          <a href="#">${voiceActor.name}</a><br>
          <small>Japanese</small>
        </td>
        <td valign="top">
          <div class="picSurround">
            <a href="#">
              <img alt="${voiceActor.name}" width="42" height="62" src="https://via.placeholder.com/42x62/cccccc/ffffff?text=No+Image" />
            </a>
          </div>
        </td>
      </tr></tbody></table>
      </td>
    </tr>`;
            });
          }
        });
      }

      return { html: htmlRows };
    } catch (error) {
      throw new BadRequestException('Failed to parse resources data');
    }
  }

  async getDoublageFromResources(animeId: number): Promise<{ doublage: string }> {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { commentaire: true },
    });

    if (!anime || !anime.commentaire) {
      throw new BadRequestException('No resources data found for this anime');
    }

    try {
      const resourcesText = anime.commentaire;
      const ressources = JSON.parse(resourcesText);

      // Extract characters from merged, mal, nautiljon sources
      const charactersSources = [
        ressources.merged?.staff,
        ressources.mal?.staff,
        ressources.nautiljon?.staff,
        ressources.staff
      ].filter(Boolean);

      const allCharacters: Array<{ name: string; role: string; voice_actors?: any[] }> = [];

      for (const staffArray of charactersSources) {
        if (Array.isArray(staffArray)) {
          staffArray.forEach(member => {
            if (member.role === 'Main' || member.role === 'Supporting') {
              allCharacters.push(member);
            }
          });
        }
      }

      const doublageEntries: string[] = [];

      if (allCharacters.length > 0) {
        allCharacters.forEach(character => {
          const japaneseVoiceActors = character.voice_actors
            ? character.voice_actors.filter(va => va.language === 'Japanese')
            : [];

          // Only include characters that have Japanese voice actors
          if (japaneseVoiceActors.length > 0) {
            japaneseVoiceActors.forEach(voiceActor => {
              // Format: {voice actor} ({character name})
              doublageEntries.push(`${voiceActor.name} (${character.name})`);
            });
          }
        });
      }

      return { doublage: doublageEntries.join(', ') };
    } catch (error) {
      throw new BadRequestException('Failed to parse resources data');
    }
  }

  private mapStaffRole(role: string): string {
    // Comprehensive role mapping from script_ak/add_staff.py
    const roleMapping: { [key: string]: string } = {
      // Director/Réalisateur roles
      'Director': 'Réalisation',
      'Réalisateur': 'Réalisation',
      'Chief Director': 'Directeur exécutif',
      'Assistant Director': 'Assistance à la réalisation',
      'Episode Director': 'Directeur d\'épisode',
      'Series Director': 'Supervision',

      // Producer/Production roles
      'Producer': 'Producteur (staff)',
      'Production': 'Production',
      'Executive Producer': 'Producteur délégué',
      'Line Producer': 'Producteur exécutif',
      'Production Manager': 'Production manager',

      // Animation roles
      'Animation': 'Animation',
      'Key Animation': 'Animation clé',
      'Animateur clé': 'Animation clé',
      'Chef animateur': 'Chef animateur',
      'Chief animator': 'Chef animateur',
      'Animation Director': 'Directeur de l\'animation',
      'In-Between Animation': 'Intervaliste',
      'CGI Director': 'Réalisateur 3D',
      '3D Director': 'Réalisateur 3D',
      'CG Director': 'Réalisateur 3D',
      'CGI': 'CGI',
      'Animation CGI': 'Animation CGI',
      '3D Animation': 'Animation CGI',

      // Design roles
      'Character Design': 'Chara-design',
      'Character designer': 'Chara-design',
      'Chara-Design': 'Chara-design',
      'Original Character Design': 'Chara-design original',
      'Original character designer': 'Chara-design original',
      'Art Design': 'Art design',
      'Design Work': 'Design work',
      'Mecha Design': 'Mecha-design',
      'Monster Design': 'Monster-design',
      'Prop Design': 'Prop-design',
      'Set Design': 'Set design',
      'Scene Design': 'Scene-design',
      'Background': 'Décors',
      'Décors': 'Décors',
      'Chargé des décors': 'Décors',
      'Layout': 'Layout',
      'Color Design': 'Couleurs',
      'Couleurs': 'Couleurs',
      'Color design': 'Couleurs',
      'Colors': 'Couleurs',
      'Title Design': 'Title Design',

      // Sound/Music roles
      'Sound Director': 'Directeur du son',
      'Directeur du son': 'Directeur du son',
      'Music': 'Musique',
      'Musique': 'Musique',
      'Composer': 'Musique',
      'Sound Production': 'Production du son',
      'Music Production': 'Production de la musique',

      // Story roles
      'Original creator': 'Auteur',
      'Créateur original': 'Créateur original',
      'Original Work': 'Auteur',
      'Scenario': 'Scénario',
      'Scénariste': 'Scénario',
      'Screenplay': 'Scénario',
      'Script': 'Script',
      'Series Composition': 'Composition de la série',
      'Story': 'Scénario',
      'Original Story': 'Idée originale',
      'Concept original': 'Idée originale',
      'Original Concept': 'Idée originale',
      'Planning': 'Planning',
      'Storyboard': 'Storyboard',

      // Technical roles
      'Art Director': 'Directeur artistique',
      'Directeur artistique': 'Directeur artistique',
      'Photography Director': 'Directeur de la photographie',
      'Directeur de la photo': 'Directeur de la photographie',
      'FX Production': 'Effets spéciaux',
      'VFX Supervisor': 'Effets spéciaux',
      'FX': 'Effets spéciaux',
      'Special Effects': 'Effets spéciaux',
      'Effets spéciaux': 'Effets spéciaux',
      'Editing': 'Montage',
      'Montage': 'Montage',
      'Editor': 'Montage',

      // Studio roles
      'Studio': 'Studio d\'animation',
      'Animation Studio': 'Studio d\'animation',
      'Animation Production': 'Studio d\'animation',
      'Animation Assistance': 'Studio d\'animation (sous-traitance)',

      // Other roles
      'Supervision': 'Supervision',
      'Illustrations originales': 'Illustrations originales',
      'Original Arts': 'Illustrations originales',
      'Original Illustrations': 'Illustrations originales',
      'Distribution': 'Distribution',
      'Broadcaster': 'Diffuseur',
      'Diffuseur': 'Diffuseur',
      'Motion Design': 'Motion Design'
    };

    return roleMapping[role] || role;
  }

  private getTagMapping(): { [key: string]: { id: string; name: string } } {
    // Comprehensive tag mapping from script_ak/add_staff.py
    return {
      // === GENRES ===
      'Action': { id: 't_9', name: 'action' },
      'Aventure': { id: 't_10', name: 'aventure' },
      'Adventure': { id: 't_10', name: 'aventure' },
      'Comédie': { id: 't_15', name: 'comédie' },
      'Comedy': { id: 't_15', name: 'comédie' },
      'Drame': { id: 't_11', name: 'drame' },
      'Drama': { id: 't_11', name: 'drame' },
      'Ecchi': { id: 't_77', name: 'ecchi' },
      'Guerre': { id: 't_16', name: 'guerre' },
      'War': { id: 't_16', name: 'guerre' },
      'Historique': { id: 't_38', name: 'historique' },
      'Historical': { id: 't_38', name: 'historique' },
      'Horreur': { id: 't_19', name: 'horreur' },
      'Horreur / Épouvante': { id: 't_19', name: 'horreur' },
      'Horror': { id: 't_19', name: 'horreur' },
      'Policier': { id: 't_14', name: 'policier' },
      'Psychologique': { id: 't_18', name: 'psychologique' },
      'Psychological': { id: 't_18', name: 'psychologique' },
      'Romance': { id: 't_13', name: 'romance' },
      'Sport': { id: 't_17', name: 'sport' },
      'Sports': { id: 't_17', name: 'sport' },
      'Thriller': { id: 't_12', name: 'thriller' },
      'Slice of Life': { id: 't_45', name: 'tranches de vie' },
      'Slice of life': { id: 't_45', name: 'tranches de vie' },
      'Western': { id: 't_112', name: 'western' },
      'Jeux vidéo': { id: 't_72', name: 'jeu vidéo' },

      // === CLASSIFICATION ===
      'Josei': { id: 't_85', name: 'josei' },
      'Kodomo': { id: 't_8', name: 'kodomo' },
      'Seinen': { id: 't_5', name: 'seinen' },
      'Shôjo': { id: 't_3', name: 'shôjo' },
      'Shoujo': { id: 't_3', name: 'shôjo' },
      'Shônen': { id: 't_1', name: 'shônen' },
      'Shounen': { id: 't_1', name: 'shônen' },
      'Yaoi': { id: 't_7', name: 'yaoi' },
      'Yuri': { id: 't_6', name: 'yuri' },

      // === UNIVERS ===
      'Cyberpunk': { id: 't_41', name: 'cyberpunk' },
      'Fantastique': { id: 't_37', name: 'fantastique' },
      'Fantasy': { id: 't_35', name: 'fantasy' },
      'Gothique': { id: 't_111', name: 'gothique' },
      'Post-apocalyptique': { id: 't_39', name: 'post-apocalyptique' },
      'Réaliste': { id: 't_34', name: 'réaliste' },
      'Science-fiction': { id: 't_36', name: 'sci-fi' },
      'Sci-Fi': { id: 't_36', name: 'sci-fi' },
      'Space opera': { id: 't_22', name: 'space opera' },
      'Space Opera': { id: 't_22', name: 'space opera' },
      'Steampunk': { id: 't_40', name: 'steampunk' },
      'Surréaliste': { id: 't_133', name: 'surréaliste' },

      // === ÉPOQUE ET LIEU ===
      'École': { id: 't_33', name: 'école' },
      'Ecole': { id: 't_33', name: 'école' },
      'School': { id: 't_33', name: 'école' },
      'School Life': { id: 't_33', name: 'école' },
      'Époque Edo': { id: 't_43', name: 'époque Edo' },
      'Ère Taishō': { id: 't_188', name: 'ère Taishō' },
      'Meiji': { id: 't_167', name: 'meiji' },
      'Monde parallèle': { id: 't_121', name: 'monde parallèle' },
      'Univers alternatif': { id: 't_121', name: 'monde parallèle' },
      'Moyen Age': { id: 't_44', name: 'Moyen Age' },
      'Prison': { id: 't_145', name: 'prison' },
      'Seconde guerre mondiale': { id: 't_42', name: 'seconde guerre mondiale' },

      // === SOUS-GENRE ===
      'Arts martiaux': { id: 't_31', name: 'arts martiaux' },
      'Combat': { id: 't_20', name: 'combat' },
      'Combats': { id: 't_20', name: 'combat' },
      'Harem': { id: 't_26', name: 'harem' },
      'Isekai': { id: 't_186', name: 'isekai' },
      'Magical girl': { id: 't_24', name: 'magical girl' },
      'Mahou Shoujo': { id: 't_24', name: 'magical girl' },
      'Magie': { id: 't_25', name: 'magie' },
      'Magic': { id: 't_25', name: 'magie' },
      'Mecha': { id: 't_23', name: 'mecha' },
      'Mechas': { id: 't_23', name: 'mecha' },
      'Mystère': { id: 't_104', name: 'mystère' },
      'Mystery': { id: 't_104', name: 'mystère' },
      'Parodie': { id: 't_30', name: 'parodie' },
      'Super-pouvoirs': { id: 't_32', name: 'super-pouvoirs' },
      'Surnaturel': { id: 't_80', name: 'surnaturel' },
      'Supernatural': { id: 't_80', name: 'surnaturel' },
      'Voyage temporel': { id: 't_158', name: 'voyage temporel' },
      'Time Travel': { id: 't_158', name: 'voyage temporel' },

      // === PERSONNAGES ===
      'Aliens / Extra-terrestres': { id: 't_102', name: 'extra-terrestre' },
      'Extra-terrestre': { id: 't_102', name: 'extra-terrestre' },
      'Ange': { id: 't_88', name: 'ange' },
      'Animal': { id: 't_114', name: 'animal' },
      'Assassin': { id: 't_179', name: 'assassin' },
      'Catgirl': { id: 't_98', name: 'catgirl' },
      'Chasseur de prime': { id: 't_49', name: 'chasseur de prime' },
      'Cyborg': { id: 't_53', name: 'cyborg' },
      'Démon': { id: 't_56', name: 'démon' },
      'Démons': { id: 't_56', name: 'démon' },
      'Détective': { id: 't_134', name: 'détective' },
      'Dieu/déesse': { id: 't_78', name: 'dieu/déesse' },
      'Enfant': { id: 't_119', name: 'enfant' },
      'Espion': { id: 't_182', name: 'espion' },
      'Fantôme': { id: 't_107', name: 'fantôme' },
      'Fantômes': { id: 't_107', name: 'fantôme' },
      'Guerrier': { id: 't_108', name: 'guerrier' },
      'Idol': { id: 't_175', name: 'idol' },
      'Idols': { id: 't_175', name: 'idol' },
      'Magicien': { id: 't_52', name: 'magicien' },
      'Militaire': { id: 't_93', name: 'militaire' },
      'Monstre': { id: 't_110', name: 'monstre' },
      'Monstres': { id: 't_110', name: 'monstre' },
      'Ninja': { id: 't_89', name: 'ninja' },
      'Pirate': { id: 't_87', name: 'pirate' },
      'Robot': { id: 't_92', name: 'robot' },
      'Robots': { id: 't_92', name: 'robot' },
      'Samouraï': { id: 't_51', name: 'samouraï' },
      'Samouraïs': { id: 't_51', name: 'samouraï' },
      'Sorcière': { id: 't_127', name: 'sorcière' },
      'Super-héros': { id: 't_101', name: 'super-héros' },
      'Vampire': { id: 't_55', name: 'vampire' },
      'Vampires': { id: 't_55', name: 'vampire' },
      'Yakuza': { id: 't_100', name: 'yakuza' },
      'Yōkai': { id: 't_168', name: 'yôkai' },
      'Zombie': { id: 't_170', name: 'zombie' },
      'Zombies': { id: 't_170', name: 'zombie' },

      // === ACTIVITÉS ===
      'Cosplay': { id: 't_74', name: 'cosplay' },
      'Cuisine': { id: 't_105', name: 'cuisine' },
      'Gastronomie': { id: 't_105', name: 'cuisine' },
      'Gourmet': { id: 't_105', name: 'cuisine' },
      'Musique': { id: 't_73', name: 'musique' },
      'Music': { id: 't_73', name: 'musique' },

      // === ARCHÉTYPE ===
      'Otaku': { id: 't_59', name: 'otaku' },
      'Otaku Culture': { id: 't_59', name: 'otaku' },

      // === ÉLEMENT NARRATIF/THÈME ===
      'Compétition': { id: 't_128', name: 'compétition' },
      'Religion': { id: 't_150', name: 'religion' },
      'Triangle amoureux': { id: 't_27', name: 'triangle amoureux' },
      'Vengeance': { id: 't_148', name: 'vengeance' },
      'Violence': { id: 't_126', name: 'violence' },

      // === MOTS-CLÉ DIVERS ===
      'Moe': { id: 't_165', name: 'moe' },
      'Mythologie': { id: 't_172', name: 'mythologie' },
      'Transformation': { id: 't_194', name: 'transformation' },

      // === SPECIAL MAPPINGS ===
      'Adolescence': { id: 't_45', name: 'tranches de vie' },
      'Amour': { id: 't_13', name: 'romance' },
      'Couture': { id: 't_45', name: 'tranches de vie' },
      'Dystopie': { id: 't_39', name: 'post-apocalyptique' },
    };
  }

  async getTagMappings(): Promise<{ [key: string]: { id: string; name: string } }> {
    return this.getTagMapping();
  }

  async importStaffFromResources(animeId: number, staffToImport: Array<{ businessId: number, role: string }>): Promise<any> {
    try {
      const results: Array<{ businessId: number; status: string; message: string; }> = [];

      for (const staff of staffToImport) {
        // Validate businessId exists (prevent auto-creation)
        if (!staff.businessId || typeof staff.businessId !== 'number') {
          results.push({
            businessId: staff.businessId,
            status: 'error',
            message: 'Invalid or missing businessId - staff member must exist in ak_business table'
          });
          continue;
        }

        // Verify the business actually exists in ak_business table
        const businessExists = await this.prisma.$queryRawUnsafe(
          `SELECT 1 FROM ak_business WHERE idBusiness = $1 LIMIT 1`,
          staff.businessId
        );

        if ((businessExists as any[]).length === 0) {
          results.push({
            businessId: staff.businessId,
            status: 'error',
            message: 'Business not found in database - cannot import non-existent staff member'
          });
          continue;
        }

        // Check if relationship already exists with same role
        const existing = await this.prisma.$queryRawUnsafe(
          `SELECT 1 FROM ak_business_to_animes WHERE id_anime = $1 AND id_business = $2 AND type = $3 LIMIT 1`,
          animeId,
          staff.businessId,
          staff.role || null
        );

        if ((existing as any[]).length > 0) {
          results.push({
            businessId: staff.businessId,
            status: 'skipped',
            message: 'Staff member already attached with this role'
          });
          continue;
        }

        // Add staff relationship (only for existing businesses)
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
        errors: results.filter(r => r.status === 'error').length,
        results
      };
    } catch (error) {
      throw new BadRequestException('Failed to import staff: ' + error.message);
    }
  }

  /**
   * Translate text using DeepL service
   * @param text Text to translate
   * @param targetLang Target language code (default: 'FR')
   * @param sourceLang Source language code (optional)
   * @returns Translation result with success status
   */
  async translateText(
    text: string,
    targetLang: string = 'FR',
    sourceLang?: string
  ): Promise<{ translatedText: string | null; success: boolean }> {
    if (!text || text.trim().length === 0) {
      return { translatedText: null, success: false };
    }

    const translatedText = await this.deepLService.translate(
      text,
      targetLang,
      sourceLang
    );

    return {
      translatedText,
      success: !!translatedText
    };
  }
}