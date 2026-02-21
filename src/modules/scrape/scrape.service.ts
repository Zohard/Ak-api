import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { load } from 'cheerio';
import { PrismaService } from '../../shared/services/prisma.service';
import { AniListService } from '../anilist/anilist.service';

type ScrapeSource = 'mal' | 'nautiljon' | 'anilist' | 'auto';

@Injectable()
export class ScrapeService {
  constructor(
    private prisma: PrismaService,
    private anilistService: AniListService,
  ) { }
  private readonly logger = new Logger(ScrapeService.name);


  // Add these at the top of your ScrapeService class:
  private requestCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes (increased from 5)
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_DELAY = 1000; // 1 second between requests

  /**
   * Clear old cache entries to prevent memory leaks
   * Call this periodically or when cache gets too large
   */
  private clearOldCache() {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.requestCache.forEach((value, key) => {
      if (now - value.timestamp > this.CACHE_TTL) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.requestCache.delete(key));

    if (keysToDelete.length > 0) {

    }
  }

  // Replace your fetchHtml method with this improved version:
  private async fetchHtml(url: string) {
    // Clear old cache entries periodically (every 100 requests)
    if (this.requestCache.size > 100) {
      this.clearOldCache();
    }

    // Check cache first
    const cached = this.requestCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {

      return load(cached.data);
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_DELAY - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    // Fetch with timeout and retries
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        // Increase timeout to 30 seconds for slower sites
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 429 && attempt < 3) {
            // Exponential backoff for rate limiting: 3s, 6s, 9s
            const delay = 3000 * attempt;

            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          if (res.status === 403 || res.status === 503) {
            try {
              const body = await res.text();
              this.logger.error(`Fetch failed ${res.status} for ${url}. Body preview: ${body.substring(0, 1000)}`);
            } catch (e) {
              console.error('Failed to read error body', e);
            }
          }

          if (res.status >= 500 && attempt < 3) {
            // Server error, retry with exponential backoff
            const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s

            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new BadRequestException(`Fetch failed ${res.status}`);
        }

        const html = await res.text();

        // Cache the result
        this.requestCache.set(url, { data: html, timestamp: Date.now() });

        return load(html);

      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError' && attempt < 3) {
          // Exponential backoff for timeouts: 2s, 4s, 8s
          const delay = 2000 * Math.pow(2, attempt - 1);

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // Network errors, DNS errors, etc
        if ((error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') && attempt < 3) {
          const delay = 2000 * Math.pow(2, attempt - 1);

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        if (attempt === 3) break;
      }
    }

    const errorMsg = lastError?.message || 'Failed to fetch after retries';
    console.error(`Scraping failed for ${url}: ${errorMsg}`);
    throw lastError || new BadRequestException(errorMsg);
  }

  /**
   * Check if an anime already exists in database by title
   * Returns the existing anime if found, null otherwise
   */
  async checkAnimeExists(title: string) {
    if (!title?.trim()) return null;

    try {
      const anime = await this.prisma.akAnime.findFirst({
        where: {
          OR: [
            { titre: { equals: title, mode: 'insensitive' } },
            { titreFr: { equals: title, mode: 'insensitive' } },
            { titreOrig: { equals: title, mode: 'insensitive' } }
          ]
        },
        select: {
          idAnime: true,
          titre: true,
          titreFr: true,
          titreOrig: true,
          statut: true
        }
      });

      return anime;
    } catch (error) {
      console.error('Error checking anime exists:', error);
      return null;
    }
  }

  /**
   * Check if a person (staff/character) already exists in database by name
   * Returns the existing person if found, null otherwise
   */
  async checkPersonExists(name: string) {
    if (!name?.trim()) return null;

    try {
      const person = await this.prisma.akBusiness.findFirst({
        where: {
          denomination: { equals: name, mode: 'insensitive' }
        },
        select: {
          idBusiness: true,
          denomination: true
        }
      });

      return person;
    } catch (error) {
      console.error('Error checking person exists:', error);
      return null;
    }
  }

  /**
   * Batch check if multiple people exist in database
   * Returns a Map of name -> existing person
   */
  async batchCheckPeopleExist(names: string[]): Promise<Map<string, any>> {
    const results = new Map();

    if (!names || names.length === 0) return results;

    try {
      const people = await this.prisma.akBusiness.findMany({
        where: {
          denomination: { in: names, mode: 'insensitive' }
        },
        select: {
          idBusiness: true,
          denomination: true
        }
      });

      people.forEach(person => {
        if (person.denomination) {
          results.set(person.denomination.toLowerCase(), person);
        }
      });
    } catch (error) {
      console.error('Error batch checking people exist:', error);
    }

    return results;
  }

  private formatMALName(name: string): string {
    // Transform "Last name, First name" to "First name Last name"
    if (name.includes(',')) {
      const [lastName, firstName] = name.split(',').map(part => part.trim());
      return `${firstName} ${lastName}`;
    }
    return name;
  }

  private async scrapeMAL(q: string) {
    const isUrl = /^https?:\/\//i.test(q);
    let animeUrl = q;
    if (!isUrl) {
      const searchUrl = `https://myanimelist.net/anime.php?q=${encodeURIComponent(q)}&cat=anime`;
      const $s = await this.fetchHtml(searchUrl);
      const first = $s('.js-categories-seasonal a[href*="/anime/"]').first().attr('href');
      if (!first) throw new NotFoundException('MAL: no results');
      animeUrl = first.startsWith('http') ? first : `https://myanimelist.net${first}`;
    }

    const $ = await this.fetchHtml(animeUrl);

    const textAfterLabel = (label: string) => {
      let out = '';
      $('span.dark_text').each((_, el) => {
        const t = $(el).text().trim();
        if (t.startsWith(label)) {
          const parent = $(el).parent();
          const clone = parent.clone();
          clone.find('span.dark_text').remove();
          out = clone.text().trim();
          if (out) return false;
        }
      });
      return out;
    };

    const title = $('h1.title-name strong').text().trim() || $('h1 strong').first().text().trim();
    const synonyms = textAfterLabel('Synonyms:');
    const altTitles = synonyms ? synonyms.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const genres = $('span.dark_text').filter((_, el) => $(el).text().includes('Genres:')).first().parent().find('a').map((_, a) => $(a).text().trim()).get();
    const themes = $('span.dark_text').filter((_, el) => $(el).text().includes('Themes:')).first().parent().find('a').map((_, a) => $(a).text().trim()).get();
    const studios = $('span.dark_text').filter((_, el) => $(el).text().includes('Studios:')).first().parent().find('a').map((_, a) => $(a).text().trim()).get();

    let officialSite = '';
    $('div.external_links a').each((_, a) => {
      const caption = $(a).find('div.caption').text();
      if (caption && caption.includes('Official Site') && $(a).attr('href')) {
        officialSite = $(a).attr('href') as string;
        return false;
      }
    });

    const synopsis = $('p[itemprop="description"]').text().trim() || $('span[itemprop="description"]').text().trim();
    const episodes = textAfterLabel('Episodes:');
    const aired = textAfterLabel('Aired:');
    const status = textAfterLabel('Status:');
    const type = textAfterLabel('Type:');
    const duration = textAfterLabel('Duration:');

    // Extract image URL from MAL leftside div
    let imageUrl = '';
    const imageElement = $('.leftside img[data-src], .leftside img[src]').first();
    if (imageElement.length) {
      imageUrl = imageElement.attr('data-src') || imageElement.attr('src') || '';
      // Clean up the URL - remove any lazyloading parameters
      if (imageUrl && imageUrl.includes('cdn.myanimelist.net')) {
        imageUrl = imageUrl.split('?')[0]; // Remove query parameters
      }
    }

    // Extract characters information with voice actors
    const characters: Array<{ name: string; role: string; voice_actors: Array<{ name: string; language: string }> }> = [];

    // Look for characters section - find the div.detail-characters-list that comes after Characters header
    const charactersSection = $('.detail-characters-list').first();

    if (charactersSection.length) {
      // Process both left and right columns
      const leftColumn = charactersSection.find('.left-column');
      const rightColumn = charactersSection.find('.left-right');

      // Function to extract characters from a column
      const extractCharactersFromColumn = (column: any) => {
        column.find('table').each((_, table) => {
          const $table = $(table);

          // Character info is in the second td
          const characterCell = $table.find('td').eq(1);
          const characterNameLink = characterCell.find('h3.h3_characters_voice_actors a').first();
          const characterRoleElement = characterCell.find('.spaceit_pad small').first();

          const characterName = this.formatMALName(characterNameLink.text().trim());
          const characterRole = characterRoleElement.text().trim();

          // Only process Main and Supporting characters
          if (characterName && (characterRole === 'Main' || characterRole === 'Supporting')) {
            const voiceActors: Array<{ name: string; language: string }> = [];

            // Voice actor info is in the third td
            const voiceActorCell = $table.find('td').eq(2);

            // Extract voice actors from nested table structure
            voiceActorCell.find('table tr').each((_, row) => {
              const $row = $(row);
              const vaCell = $row.find('td').first();
              const vaNameLink = vaCell.find('a').first();
              const vaLanguageSmall = vaCell.find('small').first();

              const vaName = this.formatMALName(vaNameLink.text().trim());
              const vaLanguage = vaLanguageSmall.text().trim();

              if (vaName && vaLanguage) {
                voiceActors.push({
                  name: vaName,
                  language: vaLanguage
                });
              }
            });

            characters.push({
              name: characterName,
              role: characterRole,
              voice_actors: voiceActors
            });
          }
        });
      };

      // Extract from both columns
      if (leftColumn.length) {
        extractCharactersFromColumn(leftColumn);
      }
      if (rightColumn.length) {
        extractCharactersFromColumn(rightColumn);
      }
    }

    // Extract staff information (production staff, not characters)
    const staff: Array<{ name: string; role: string }> = [];

    // Look for staff section after "Staff" header
    let staffSectionFound = false;
    $('h2, .detail-characters-list').each((_, element) => {
      const $element = $(element);

      if ($element.is('h2') && $element.text().trim() === 'Staff') {
        staffSectionFound = true;
        return true; // continue
      }

      if (staffSectionFound && $element.hasClass('detail-characters-list')) {
        // Extract staff from this section
        $element.find('table').each((_, table) => {
          const $table = $(table);
          const nameLink = $table.find('td').eq(1).find('a').first();
          const roleBadge = $table.find('.spaceit_pad small').first();

          const name = this.formatMALName(nameLink.text().trim());
          const role = roleBadge.text().trim();

          // Only include actual production staff roles, not character roles
          if (name && role && role !== 'Main' && role !== 'Supporting') {
            staff.push({ name, role });
          }
        });
        return false; // stop after processing staff section
      }
    });

    return {
      source: 'mal',
      url: animeUrl,
      title,
      alt_titles: altTitles,
      synopsis,
      genres,
      themes,
      studios,
      official_site: officialSite,
      episodes,
      aired,
      status,
      type,
      staff,
      characters,
      image_url: imageUrl,
      duration,
    };
  }

  private async scrapeNautiljon(q: string) {
    const isUrl = /^https?:\/\//i.test(q);
    const formatName = (name: string) => name.toLowerCase().replace(/ \: /g, ' - ').replace(/\s+/g, '+');
    const url = isUrl ? q : `https://www.nautiljon.com/animes/${formatName(q)}.html`;
    const $ = await this.fetchHtml(url);

    const h1 = $('h1.h1titre').first().clone();
    h1.find('a.buttonlike').remove();
    const title = h1.text().trim() || $('div.image_fiche img').attr('alt') || '';

    // Alternative titles
    const altTitles: string[] = [];
    let altLi: any;
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Titre alternatif')) { altLi = li; return false; }
    });
    if (altLi) {
      const spanAlt = $(altLi).find("span[itemprop='alternateName']").first().text().trim();
      if (spanAlt) altTitles.push(spanAlt);
      let text = $(altLi).text().replace('Titre alternatif :', '').trim();
      if (spanAlt) text = text.replace(spanAlt, '');
      text.split('/').map((s) => s.trim()).filter(Boolean).forEach((t) => altTitles.push(t));
    }

    // Original title
    let original_title = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Titre original')) {
        original_title = t.replace('Titre original :', '').trim();
        return false;
      }
    });

    // Format and episodes (first ul.mb10 li)
    let format = '';
    let episodes_count = '';
    const firstLi = $('ul.mb10 li').first();
    if (firstLi.length) {
      format = firstLi.find('a').first().text().trim();
      const epSpan = firstLi.find("span[itemprop='numberOfEpisodes']").first();
      if (epSpan.length) episodes_count = epSpan.text().trim();
    }

    // Airing dates and season
    let airing_dates = '';
    let season = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Diffusion :')) {
        airing_dates = t.replace('Diffusion :', '').trim();
        const link = $(li).find("a[href*='/animes/']").first().text().trim();
        if (link) season = link;
        return false;
      }
    });

    // Duration
    let duration = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Durée :')) {
        duration = t.replace('Durée :', '').trim();
        return false;
      }
    });

    // Genres
    const genres = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Genres :')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find("a span[itemprop='genre']").map((_, s) => $(s).text().trim()).get();
    })();

    // Themes
    const themes = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Thèmes :')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find("a span[itemprop='genre']").map((_, s) => $(s).text().trim()).get();
    })();

    // Studio
    let studio = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes("Studio d'animation")) {
        const s = $(li).find("span[itemprop='legalName']").first().text().trim();
        if (s) studio = s;
        return false;
      }
    });

    // Streaming
    const streaming = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Simulcast / streaming')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find('a').map((_, a) => $(a).text().trim()).get();
    })();

    // Official sites
    const official_website = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Site web officiel')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find('a').map((_, a) => $(a).attr('href') || '').get().filter(Boolean);
    })();

    // Synopsis
    const synopsisNode = $('div.description').first().clone();
    synopsisNode.find('div.fader').remove();
    const synopsis = synopsisNode.text().trim();

    // Extract image URL from Nautiljon .image_fiche div
    let imageUrl = '';
    const imageElement = $('.image_fiche img').first();
    if (imageElement.length) {
      const imgSrc = imageElement.attr('src');
      if (imgSrc && imgSrc.includes('/images/anime/')) {
        // Convert from mini version to full version if needed
        imageUrl = imgSrc.replace('/mini/', '/').replace(/\?.*$/, ''); // Remove query parameters
        // Make sure it's an absolute URL
        if (imageUrl.startsWith('/')) {
          imageUrl = `https://www.nautiljon.com${imageUrl}`;
        }
      }
    }

    // Extract characters information with voice actors
    const characters: Array<{ name: string; role: string; voice_actors: Array<{ name: string; language: string }> }> = [];

    // Look for characters section ("Personnages" in French)
    const charactersSection = $('div.top_bloc').filter((_, el) => {
      const h2Text = $(el).find('h2').text().trim();
      return h2Text === 'Personnages' || h2Text === 'Characters';
    }).first();

    if (charactersSection.length) {
      // Extract from visible characters
      charactersSection.find('.unPeople').each((_, person) => {
        const $person = $(person);
        const nameEl = $person.find('.unPeopleT a').first();
        const roleEl = $person.find('.nom_role').first();

        const characterName = nameEl.text().trim();
        const characterRole = roleEl.text().trim();

        // Map French roles to English
        let mappedRole = characterRole;
        if (characterRole === 'Principal' || characterRole === 'Principale') {
          mappedRole = 'Main';
        } else if (characterRole === 'Secondaire') {
          mappedRole = 'Supporting';
        }

        if (characterName && (mappedRole === 'Main' || mappedRole === 'Supporting')) {
          const voiceActors: Array<{ name: string; language: string }> = [];

          // Look for voice actor information in the same person block
          $person.find('.doublage').each((_, vaElement) => {
            const $vaElement = $(vaElement);
            const vaText = $vaElement.text().trim();

            // Parse voice actor info (usually format: "Voice Actor Name (Language)")
            const vaMatch = vaText.match(/(.+?)\s*\((.+?)\)/);
            if (vaMatch) {
              const vaName = vaMatch[1].trim();
              let vaLanguage = vaMatch[2].trim();

              // Map French language names to English
              if (vaLanguage === 'japonais' || vaLanguage === 'jp' || vaLanguage === 'ja') {
                vaLanguage = 'Japanese';
              } else if (vaLanguage === 'français' || vaLanguage === 'fr') {
                vaLanguage = 'French';
              } else if (vaLanguage === 'anglais' || vaLanguage === 'en') {
                vaLanguage = 'English';
              }

              if (vaName && vaLanguage) {
                voiceActors.push({
                  name: vaName,
                  language: vaLanguage
                });
              }
            } else if (vaText && !vaText.includes('(')) {
              // If no language specified, assume Japanese for anime
              voiceActors.push({
                name: vaText,
                language: 'Japanese'
              });
            }
          });

          characters.push({
            name: characterName,
            role: mappedRole,
            voice_actors: voiceActors
          });
        }
      });

      // Also extract from hidden characters (characters_next)
      charactersSection.find('#personnages_next .unPeople, #characters_next .unPeople').each((_, person) => {
        const $person = $(person);
        const nameEl = $person.find('.unPeopleT a').first();
        const roleEl = $person.find('.nom_role').first();

        const characterName = nameEl.text().trim();
        const characterRole = roleEl.text().trim();

        // Map French roles to English
        let mappedRole = characterRole;
        if (characterRole === 'Principal' || characterRole === 'Principale') {
          mappedRole = 'Main';
        } else if (characterRole === 'Secondaire') {
          mappedRole = 'Supporting';
        }

        if (characterName && (mappedRole === 'Main' || mappedRole === 'Supporting')) {
          const voiceActors: Array<{ name: string; language: string }> = [];

          // Look for voice actor information in the same person block
          $person.find('.doublage').each((_, vaElement) => {
            const $vaElement = $(vaElement);
            const vaText = $vaElement.text().trim();

            // Parse voice actor info (usually format: "Voice Actor Name (Language)")
            const vaMatch = vaText.match(/(.+?)\s*\((.+?)\)/);
            if (vaMatch) {
              const vaName = vaMatch[1].trim();
              let vaLanguage = vaMatch[2].trim();

              // Map French language names to English
              if (vaLanguage === 'japonais' || vaLanguage === 'jp' || vaLanguage === 'ja') {
                vaLanguage = 'Japanese';
              } else if (vaLanguage === 'français' || vaLanguage === 'fr') {
                vaLanguage = 'French';
              } else if (vaLanguage === 'anglais' || vaLanguage === 'en') {
                vaLanguage = 'English';
              }

              if (vaName && vaLanguage) {
                voiceActors.push({
                  name: vaName,
                  language: vaLanguage
                });
              }
            } else if (vaText && !vaText.includes('(')) {
              // If no language specified, assume Japanese for anime
              voiceActors.push({
                name: vaText,
                language: 'Japanese'
              });
            }
          });

          characters.push({
            name: characterName,
            role: mappedRole,
            voice_actors: voiceActors
          });
        }
      });
    }

    // Extract staff information
    const staff: Array<{ name: string; role: string }> = [];

    // Look for staff section
    const staffSection = $('div.top_bloc').filter((_, el) => {
      return $(el).find('h2').text().trim() === 'Staff';
    }).first();

    if (staffSection.length) {
      // Extract from visible staff members
      staffSection.find('.unPeople').each((_, person) => {
        const $person = $(person);
        const nameEl = $person.find('.unPeopleT a').first();
        const roleEl = $person.find('.nom_role').first();

        const name = nameEl.text().trim();
        const role = roleEl.text().trim();

        if (name && role) {
          staff.push({ name, role });
        }
      });

      // Also extract from hidden staff (staff_next)
      staffSection.find('#staff_next .unPeople').each((_, person) => {
        const $person = $(person);
        const nameEl = $person.find('.unPeopleT a').first();
        const roleEl = $person.find('.nom_role').first();

        const name = nameEl.text().trim();
        const role = roleEl.text().trim();

        if (name && role) {
          staff.push({ name, role });
        }
      });
    }

    return {
      source: 'nautiljon',
      url,
      title,
      original_title,
      alternative_titles: altTitles,
      format,
      episodes_count,
      airing_dates,
      season,
      genres,
      themes,
      studio,
      streaming,
      official_website,
      synopsis,
      staff,
      characters,
      image_url: imageUrl,
      duration,
    };
  }

  private mergeInfo(mal: any | null, nj: any | null) {
    const merged: any = {
      title: '',
      titre: '',
      titre_orig: '',
      titres_alternatifs: [] as string[],
      synopsis: '',
      genres: [] as string[],
      themes: [] as string[],
      studios: [] as string[],
      staff: [] as Array<{ name: string; role: string }>,
      characters: [] as Array<{ name: string; role: string; voice_actors: Array<{ name: string; language: string }> }>,
      episode_count: '',
      official_sites: [] as string[],
      source_urls: {} as Record<string, string>,
      image_url: '', // Prioritize MAL image, fallback to Nautiljon
      duration: '',
    };

    if (mal?.url) merged.source_urls.myanimelist = mal.url;
    if (nj?.url) merged.source_urls.nautiljon = nj.url;

    merged.title = mal?.title || nj?.title || '';
    merged.titre = merged.title;
    merged.titre_orig = nj?.original_title || '';

    const alt = new Set<string>();
    (mal?.alt_titles || []).forEach((t: string) => t && alt.add(t));
    (nj?.alternative_titles || []).forEach((t: string) => t && alt.add(t));
    merged.titres_alternatifs = Array.from(alt);

    // Skip synopsis due to copyright concerns
    merged.synopsis = '';

    const g = new Set<string>(); (mal?.genres || []).forEach((x: string) => g.add(x)); (nj?.genres || []).forEach((x: string) => g.add(x));
    merged.genres = Array.from(g);
    const th = new Set<string>(); (mal?.themes || []).forEach((x: string) => th.add(x)); (nj?.themes || []).forEach((x: string) => th.add(x));

    const st = new Set<string>(); (mal?.studios || []).forEach((x: string) => st.add(x)); if (nj?.studio) st.add(nj.studio);
    merged.studios = Array.from(st);

    // Merge staff from both sources
    const staffSet = new Map();
    (mal?.staff || []).forEach((staff: { name: string; role: string }) => {
      const key = `${staff.name?.toLowerCase() || ''}|${staff.role?.toLowerCase() || ''}`;
      if (!staffSet.has(key) && staff.name && staff.role) {
        staffSet.set(key, staff);
      }
    });
    (nj?.staff || []).forEach((staff: { name: string; role: string }) => {
      const key = `${staff.name?.toLowerCase() || ''}|${staff.role?.toLowerCase() || ''}`;
      if (!staffSet.has(key) && staff.name && staff.role) {
        staffSet.set(key, staff);
      }
    });

    // Add studios as staff with role "Studio d'animation"
    (mal?.studios || []).forEach((studioName: string) => {
      if (studioName?.trim()) {
        const key = `${studioName.toLowerCase()}|studio d'animation`;
        if (!staffSet.has(key)) {
          staffSet.set(key, { name: studioName, role: "Studio d'animation" });
        }
      }
    });

    // Add studio from Nautiljon as staff
    if (nj?.studio?.trim()) {
      const key = `${nj.studio.toLowerCase()}|studio d'animation`;
      if (!staffSet.has(key)) {
        staffSet.set(key, { name: nj.studio, role: "Studio d'animation" });
      }
    }

    merged.staff = Array.from(staffSet.values());

    // Merge characters from both sources
    const charactersSet = new Map();
    (mal?.characters || []).forEach((character: { name: string; role: string; voice_actors: Array<{ name: string; language: string }> }) => {
      const key = `${character.name?.toLowerCase() || ''}|${character.role?.toLowerCase() || ''}`;
      if (!charactersSet.has(key) && character.name && character.role) {
        charactersSet.set(key, character);
      }
    });
    (nj?.characters || []).forEach((character: { name: string; role: string; voice_actors: Array<{ name: string; language: string }> }) => {
      const key = `${character.name?.toLowerCase() || ''}|${character.role?.toLowerCase() || ''}`;
      if (!charactersSet.has(key) && character.name && character.role) {
        // If character already exists from MAL, merge voice actors
        if (charactersSet.has(key)) {
          const existingCharacter = charactersSet.get(key);
          const allVoiceActors = [...existingCharacter.voice_actors];

          character.voice_actors.forEach(va => {
            const vaKey = `${va.name?.toLowerCase() || ''}|${va.language?.toLowerCase() || ''}`;
            const exists = allVoiceActors.some(existing =>
              `${existing.name?.toLowerCase() || ''}|${existing.language?.toLowerCase() || ''}` === vaKey
            );
            if (!exists && va.name && va.language) {
              allVoiceActors.push(va);
            }
          });

          existingCharacter.voice_actors = allVoiceActors;
        } else {
          charactersSet.set(key, character);
        }
      }
    });
    merged.characters = Array.from(charactersSet.values());

    merged.episode_count = mal?.episodes || nj?.episodes_count || '';

    const sites = new Set<string>();
    if (mal?.official_site) sites.add(mal.official_site);
    (nj?.official_website || []).forEach((x: string) => sites.add(x));
    merged.official_sites = Array.from(sites);

    // Prioritize MAL image, fallback to Nautiljon
    merged.image_url = mal?.image_url || nj?.image_url || '';

    const yearFrom = (s?: string) => {
      if (!s) return '';
      const m = s.match(/(19|20)\d{2}/);
      return m ? m[0] : '';
    };
    const annee = yearFrom(mal?.aired) || yearFrom(nj?.airing_dates);

    merged.duration = mal?.duration || nj?.duration || '';

    const mapFormat = (f?: string) => {
      if (!f) return '';
      const lower = f.toLowerCase();
      if (lower.includes('tv')) return 'Série TV';
      if (lower.includes('oav') || lower.includes('ova')) return 'OAV';
      if (lower.includes('film') || lower.includes('movie')) return 'Film';
      if (lower.includes('ona')) return 'ONA';
      if (lower.includes('special') || lower.includes('spécial')) return 'Spécial';
      if (lower.includes('clip')) return 'Clip';
      return f;
    };

    const format = mapFormat(mal?.type) || mapFormat(nj?.format);

    return {
      merged,
      mal,
      nautiljon: nj,
      form: {
        titre: merged.titre,
        titre_orig: merged.titre_orig,
        titres_alternatifs: merged.titres_alternatifs.join('\n'),
        synopsis: merged.synopsis,
        annee,
        format,
        nb_epduree: merged.duration || merged.episode_count,
        official_site: merged.official_sites[0] || '',
      },
    };
  }

  /**
   * Smart scrape that checks database first before scraping
   * @param q Search query or URL
   * @param source Source to scrape from
   * @param forceRefresh Force refresh even if exists in DB
   */
  async scrapeAnime(q: string, source: ScrapeSource = 'auto', forceRefresh = false) {
    if (!q?.trim()) throw new BadRequestException('Missing query q');

    // Check if anime already exists in database (unless forcing refresh)
    if (!forceRefresh) {
      const existing = await this.checkAnimeExists(q);
      if (existing) {
        this.logger.debug(`Anime "${q}" already exists in database (ID: ${existing.idAnime})`);
        return {
          existing: true,
          anime: existing,
          message: 'Anime already exists in database. Use forceRefresh=true to re-scrape.'
        };
      }
    }

    let mal: any = null;
    let nj: any = null;

    // Handle AniList source
    if (source === 'anilist') {
      const anilistResults = await this.anilistService.searchAnime(q, 1);
      if (!anilistResults || anilistResults.length === 0) {
        throw new NotFoundException('No results from AniList');
      }

      const anime = anilistResults[0];

      // Convert AniList data to scrape format
      const result = {
        form: {
          titre: anime.title.romaji || anime.title.english || anime.title.native,
          titre_orig: anime.title.romaji,
          titres_alternatifs: [anime.title.english, anime.title.native, ...(anime.synonyms || [])].filter(Boolean).join('\n'),
          annee: anime.startDate?.year || new Date().getFullYear(),
          date_diffusion: anime.startDate?.year && anime.startDate?.month && anime.startDate?.day
            ? `${anime.startDate.year}-${String(anime.startDate.month).padStart(2, '0')}-${String(anime.startDate.day).padStart(2, '0')}`
            : null,
          format: anime.format === 'TV' ? 'Série TV' :
            anime.format === 'MOVIE' ? 'Film' :
              anime.format === 'OVA' ? 'OAV' :
                anime.format === 'ONA' ? 'ONA' :
                  anime.format === 'SPECIAL' ? 'Spécial' : 'Série TV',
          nb_epduree: (anime.duration ? `${anime.duration} min` : null) || (anime.episodes ? `${anime.episodes} eps` : 'NC'),
          official_site: anime.externalLinks?.find((link: any) => link.site === 'Official Site')?.url || null,
        },
        merged: {
          title: anime.title.romaji,
          synopsis: anime.description,
          studios: anime.studios?.nodes?.filter((s: any) => s.isAnimationStudio).map((s: any) => s.name) || [],
          episode_count: anime.episodes || 'NC',
          duration: anime.duration || null,
          genres: anime.genres || [],
          staff: anime.staff?.edges?.map((edge: any) => ({
            name: edge.node.name.full,
            role: edge.role
          })) || [],
          characters: anime.characters?.edges?.map((edge: any) => ({
            name: edge.node.name.full,
            role: edge.role,
            voice_actors: edge.voiceActors?.map((va: any) => ({
              name: va.name.full,
              language: va.languageV2
            })) || []
          })) || [],
          source_urls: {
            anilist: `https://anilist.co/anime/${anime.id}`,
            myanimelist: anime.idMal ? `https://myanimelist.net/anime/${anime.idMal}` : null
          }
        }
      };

      return result;
    }

    if (source === 'mal') {
      mal = await this.scrapeMAL(q);
    } else if (source === 'nautiljon') {
      nj = await this.scrapeNautiljon(q);
    } else {
      // Scrape both sources with better error handling
      const malPromise = this.scrapeMAL(q).catch(err => {
        this.logger.error(`MAL scraping failed: ${err.message}`);
        return null;
      });
      const njPromise = this.scrapeNautiljon(q).catch(err => {
        this.logger.error(`Nautiljon scraping failed: ${err.message}`);
        return null;
      });

      // Run both in parallel
      [mal, nj] = await Promise.all([malPromise, njPromise]);

      if (!mal && !nj) throw new NotFoundException('No results from MAL or Nautiljon');
    }

    const result: any = this.mergeInfo(mal, nj);

    // Batch check if staff/characters already exist
    const allPeopleNames: string[] = [];
    result.merged.staff.forEach((s: any) => s.name && allPeopleNames.push(s.name));
    result.merged.characters.forEach((c: any) => {
      if (c.name) allPeopleNames.push(c.name);
      c.voice_actors?.forEach((va: any) => va.name && allPeopleNames.push(va.name));
    });

    if (allPeopleNames.length > 0) {
      const existingPeople = await this.batchCheckPeopleExist(allPeopleNames);
      result.existingPeople = Object.fromEntries(existingPeople);
      this.logger.debug(`Found ${existingPeople.size} existing people out of ${allPeopleNames.length} total`);
    }

    return result;
  }

  /**
   * Scrape manga releases from booknode.com for a specific year and month
   * @param year The year (e.g. 2026)
   * @param month The month (1-12)
   * @returns Array of manga releases
   */
  async scrapeBooknodeManga(year: number, month: number) {
    // Format: dates_de_sortie-YYYY-MM
    const monthStr = month.toString().padStart(2, '0');
    const url = `https://booknode.com/dates_de_sortie-${year}-${monthStr}/manga#calendarzone`;

    const $ = await this.fetchHtml(url);
    const mangas: Array<{
      titre: string;
      auteur: string;
      releaseDate: string;
      imageUrl: string;
      booknodeUrl: string;
    }> = [];

    // Extract manga from .oneofthebook divs
    $('.oneofthebook').each((_, element) => {
      const $element = $(element);

      // Extract title and booknode URL
      const titleLink = $element.find('a.main_a.addable_elem').first();
      const titre = titleLink.attr('title')?.replace(/^Voir la page du livre\s+/i, '').trim() || titleLink.text().trim();
      const booknodeUrl = titleLink.attr('href') || '';

      // Extract author
      const auteurLink = $element.find('a.auteur').first();
      const auteur = auteurLink.attr('title')?.replace(/^Voir la page de l'auteur\s+/i, '').trim() || auteurLink.text().trim();

      // Extract release date
      const releaseDateSpan = $element.find('span').filter((_, el) => {
        const text = $(el).text();
        return text.includes('Sortie le');
      }).first();
      let releaseDate = releaseDateSpan.text().replace('Sortie le', '').trim();

      // Convert French date format (e.g., "15 janvier 2024") to ISO format (YYYY-MM-DD)
      if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
        const frenchMonths: Record<string, string> = {
          'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
          'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
          'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
        };
        const match = releaseDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (match) {
          const [, day, monthFr, year] = match;
          const month = frenchMonths[monthFr.toLowerCase()];
          if (month) {
            releaseDate = `${year}-${month}-${day.padStart(2, '0')}`;
          }
        }
      }

      // Extract image URL
      const img = $element.find('img.main_img').first();
      const imageUrl = img.attr('data-src') || img.attr('src') || '';

      // Only add if we have at least a title
      if (titre && titre.length > 0) {
        mangas.push({
          titre,
          auteur,
          releaseDate,
          imageUrl,
          booknodeUrl: booknodeUrl.startsWith('http') ? booknodeUrl : `https://booknode.com${booknodeUrl}`
        });
      }
    });

    // Remove duplicates based on title and author
    const uniqueMangas = new Map();
    mangas.forEach(manga => {
      const key = `${manga.titre.toLowerCase()}|${manga.auteur.toLowerCase()}`;
      if (!uniqueMangas.has(key)) {
        uniqueMangas.set(key, manga);
      }
    });

    return Array.from(uniqueMangas.values());
  }

  /**
   * Scrape detailed manga information from a booknode.com book page
   * @param url The booknode book URL
   * @returns Detailed manga information
   */
  async scrapeMangaNewsMangaDetails(url: string) {
    const $ = await this.fetchHtml(url);

    // Extract title
    const titre = $('h1').first().text().trim();

    // Extract authors
    const auteurs: Array<{ name: string; role: string }> = [];
    $('.entry-author a').each((_, el) => {
      const name = $(el).text().trim();
      if (name) {
        auteurs.push({ name, role: 'Auteur' });
      }
    });

    // Extract cover image
    const coverImg = $('#cover img').first();
    const coverUrl = coverImg.attr('src') || '';

    // Extract publisher (Editeur)
    const editeurs: Array<{ name: string; collection?: string }> = [];
    $('.entry-editor a').each((_, el) => {
      const name = $(el).text().trim();
      if (name) {
        editeurs.push({ name });
      }
    });

    // Extract description
    let description = '';
    const summary = $('#summary');
    if (summary.length) {
      description = summary.text().trim();
    }

    return {
      source: 'manga-news',
      url,
      titre,
      auteurs,
      coverUrl,
      editeurs,
      description
    };
  }

  /**
   * Scrape detailed manga information from a booknode.com book page
   * @param url The booknode book URL
   * @returns Detailed manga information
   */
  async scrapeBooknodeDetails(url: string) {
    const $ = await this.fetchHtml(url);

    // Title
    const title = $('h1[itemprop="name"]').text().trim() ||
      $('.book-title h1').text().trim() ||
      $('h1').first().text().trim();

    // Original title (titre original)
    const originalTitle = $('span:contains("Titre original")').parent().text()
      .replace('Titre original', '').replace(':', '').trim() ||
      $('[itemprop="alternativeHeadline"]').text().trim();

    // Author
    const author = $('a[itemprop="author"]').text().trim() ||
      $('.author-name').text().trim() ||
      $('span:contains("Auteur")').next('a').text().trim();

    // Publisher (éditeur)
    const publisher = $('a[itemprop="publisher"]').text().trim() ||
      $('span:contains("Editeur")').next('a').text().trim() ||
      $('span:contains("Éditeur")').next('a').text().trim();

    // ISBN
    const isbn = $('[itemprop="isbn"]').text().trim() ||
      $('span:contains("ISBN")').parent().text().replace(/ISBN\s*:?\s*/i, '').trim();

    // Release date
    let releaseDate = $('[itemprop="datePublished"]').attr('content') ||
      $('span:contains("Date de parution")').parent().text()
        .replace(/Date de parution\s*:?\s*/i, '').trim();

    // Parse French date format (e.g., "15 janvier 2024") to ISO format
    if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
      const frenchMonths: Record<string, string> = {
        'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
        'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
        'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
      };
      const match = releaseDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match) {
        const [, day, monthFr, year] = match;
        const month = frenchMonths[monthFr.toLowerCase()];
        if (month) {
          releaseDate = `${year}-${month}-${day.padStart(2, '0')}`;
        }
      }
    }

    // Cover image
    let imageUrl = $('.main-cover img, .cover-image img, [itemprop="image"]').attr('src') ||
      $('img.cover').attr('src');
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = `https://booknode.com${imageUrl}`;
    }

    // Synopsis/Description
    const synopsis = $('[itemprop="description"]').text().trim() ||
      $('.book-resume, .resume, .description').text().trim();

    // Number of pages
    const pageCount = $('[itemprop="numberOfPages"]').text().trim() ||
      $('span:contains("Nombre de pages")').parent().text()
        .replace(/Nombre de pages\s*:?\s*/i, '').trim();

    // Series/Collection
    const series = $('span:contains("Série")').next('a').text().trim() ||
      $('span:contains("Collection")').next('a').text().trim();

    // Volume number - try dedicated fields first, then fallback to title extraction
    let volumeNumber: number | null = null;

    // Strategy 1: Look for dedicated "Tome" or "Numéro" field on Booknode
    const tomeText = $('span:contains("Tome")').parent().text() ||
      $('span:contains("Numéro dans la série")').parent().text() ||
      $('span:contains("Numéro")').parent().text() ||
      $('[itemprop="position"]').text().trim() ||
      $('[itemprop="bookEdition"]').text().trim();

    if (tomeText) {
      const tomeMatch = tomeText.match(/(?:Tome|Numéro(?:\s+dans la série)?|#)\s*:?\s*(\d+)/i);
      if (tomeMatch) {
        volumeNumber = parseInt(tomeMatch[1], 10);
      }
    }

    // Strategy 2: Extract from series field if it contains the volume number
    if (!volumeNumber && series) {
      const seriesVolMatch = series.match(/,?\s*(?:Tome|Vol\.?|T\.?|#)\s*(\d+)/i);
      if (seriesVolMatch) {
        volumeNumber = parseInt(seriesVolMatch[1], 10);
      }
    }

    // Strategy 3: Fallback to extracting from title
    if (!volumeNumber) {
      const volMatch = title.match(/tome\s*(\d+)|vol\.?\s*(\d+)|t\.?\s*(\d+)/i);
      if (volMatch) {
        volumeNumber = parseInt(volMatch[1] || volMatch[2] || volMatch[3], 10);
      }
    }

    return {
      source: 'booknode',
      url,
      title,
      originalTitle: originalTitle || undefined,
      author: author || undefined,
      publisher: publisher || undefined,
      isbn: isbn || undefined,
      releaseDate: releaseDate || undefined,
      imageUrl: imageUrl || undefined,
      synopsis: synopsis || undefined,
      pageCount: pageCount ? parseInt(pageCount, 10) : undefined,
      series: series || undefined,
      volumeNumber,
    };
  }

  /**
   * Search Booknode for a book/manga
   * @param query Search query (e.g. ISBN or Title)
   * @returns Found book URL or null
   */
  async searchBooknode(query: string): Promise<string | null> {
    const searchUrl = `https://booknode.com/recherche?q=${encodeURIComponent(query)}`;

    // Check if we already have a cached result for this exact query
    if (this.requestCache.has(searchUrl)) {
      const cached = this.requestCache.get(searchUrl);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        // If the query was cached, we need to parse it again to extract the URL
        // OR we could cache the result, but fetchHtml returns loaded cheerio object
        // For simplicity, we just let fetchHtml handle the caching logic
      }
    }

    try {
      const $ = await this.fetchHtml(searchUrl);

      // Check if we were redirected to a book page directly
      // This is tricky with fetchHtml unless we check the loaded HTML for book-specific elements
      if ($('.main-cover.physical-cover').length > 0) {
        // We are on a book page!
        // Try to extract canonical URL
        const canonical = $('link[rel="canonical"]').attr('href');
        if (canonical) return canonical;
      }

      // Check for search results
      // Look for book links in results
      let bookUrl: string | null = null;

      // Select books from result list
      $('.book_search_result, .row.search-row').each((_, el) => {
        if (bookUrl) return; // Found one already

        const $el = $(el);
        const link = $el.find('a').first();
        const href = link.attr('href');

        if (href && href.includes('/livre/')) {
          bookUrl = href;
        }
      });

      if (!bookUrl) {
        // Try alternate selector (Booknode generic search results)
        $('.search-result-item, .row.result-row').each((_, el) => {
          if (bookUrl) return;
          const href = $(el).find('a').attr('href');
          if (href && href.includes('/livre/')) {
            bookUrl = href;
          }
        });
      }

      return bookUrl;

    } catch (error) {
      this.logger.error(`Error searching Booknode for "${query}": ${error.message}`);
      return null;
    }
  }

  /**
   * Search Manga-News for a manga by ISBN
   */
  async searchMangaNews(query: string): Promise<string | null> {
    const searchUrl = `https://www.manga-news.com/index.php/recherche?q=${encodeURIComponent(query)}`;

    try {
      const $ = await this.fetchHtml(searchUrl);

      // Check for canonical on potential direct page hit
      if ($('#cover').length > 0 && $('h1').length > 0) {
        const canonical = $('link[rel="canonical"]').attr('href');
        if (canonical) return canonical;
      }

      // Check for search results
      let bookUrl: string | null = null;

      // Look for results in #results_search
      $('#results_search .entry').each((_, el) => {
        if (bookUrl) return;

        const $el = $(el);
        const link = $el.find('a.title').first();
        const href = link.attr('href');

        // Filter: ensure it's a volume/manga page
        if (href && (href.includes('/manga/') || href.includes('/vol/'))) {
          bookUrl = href;
        }
      });

      return bookUrl;

    } catch (error) {
      this.logger.error(`Error searching Manga-News for "${query}": ${error.message}`);
      return null;
    }
  }

  async scrapeManga(q: string) {
    return this.scrapeNautiljonManga(q);
  }

  /**
   * Scrape manga releases from mangacollec.com/planning for a specific year and month
   * Extracts window.DATA_STORE JSON from the page, then resolves:
   *   volume.edition_id → editions.data[edition_id].series_id → series.data[series_id].title
   * @param year The year (e.g. 2026)
   * @param month The month (1-12)
   * @returns Array of manga releases with title, volume number, release date, image, ISBN
   */
  async scrapeMangaCollecPlanning(year: number, month: number) {
    const monthStr = month.toString().padStart(2, '0');
    const planningKey = `${year}-${monthStr}`;
    const url = `https://www.mangacollec.com/planning`;

    const $ = await this.fetchHtml(url);
    const html = $.html();

    // Extract window.DATA_STORE JSON from the page
    // The JSON is huge so we find the start marker and extract up to the closing ";</script>"
    const marker = 'window.DATA_STORE = ';
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) {
      throw new BadRequestException('Could not find DATA_STORE in MangaCollec page');
    }
    const jsonStart = startIdx + marker.length;
    // Find the </script> tag after the DATA_STORE, then look back for the ";"
    const scriptEnd = html.indexOf('</script>', jsonStart);
    if (scriptEnd === -1) {
      throw new BadRequestException('Could not find end of DATA_STORE in MangaCollec page');
    }
    // The JSON ends with "};" — trim whitespace between ";" and "</script>"
    const segment = html.substring(jsonStart, scriptEnd).trimEnd();
    // Remove trailing semicolon
    const jsonStr = segment.endsWith(';') ? segment.slice(0, -1) : segment;

    let dataStore: any;
    try {
      dataStore = JSON.parse(jsonStr);
    } catch (e) {
      throw new BadRequestException('Failed to parse DATA_STORE JSON from MangaCollec');
    }

    const volumes = dataStore.volumes?.data || {};
    const editions = dataStore.editions?.data || {};
    const series = dataStore.series?.data || {};
    const publishers = dataStore.publishers?.data || {};
    const planningData = dataStore.planning?.[planningKey];

    if (!planningData || !planningData.volumes || !Array.isArray(planningData.volumes)) {
      return [];
    }

    const results: Array<{
      titre: string;
      number: number | null;
      releaseDate: string;
      imageUrl: string;
      isbn: string;
      seriesTitle: string;
      publisher: string;
      mangacollecVolumeId: string;
    }> = [];

    for (const volumeId of planningData.volumes) {
      const volume = volumes[volumeId];
      if (!volume) continue;

      const edition = editions[volume.edition_id];
      const serie = edition ? series[edition.series_id] : null;
      const publisher = edition ? publishers[edition.publisher_id] : null;

      const seriesTitle = serie?.title || '';
      const volumeTitle = volume.title || '';
      // Build display title: "Series Title - Tome X" or just volume title
      const displayTitle = seriesTitle
        ? (volume.number ? `${seriesTitle} - Tome ${volume.number}` : seriesTitle)
        : volumeTitle || 'Unknown';

      results.push({
        titre: displayTitle,
        number: volume.number ?? null,
        releaseDate: volume.release_date || '',
        imageUrl: volume.image_url || '',
        isbn: volume.isbn || '',
        seriesTitle,
        publisher: publisher?.title || '',
        mangacollecVolumeId: volumeId,
      });
    }

    // Sort by release date
    results.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    return results;
  }

  private async scrapeNautiljonManga(q: string) {
    const isUrl = /^https?:\/\//i.test(q);
    const formatName = (name: string) => name.toLowerCase().replace(/ \: /g, ' - ').replace(/\s+/g, '+');
    const url = isUrl ? q : `https://www.nautiljon.com/mangas/${formatName(q)}.html`;
    const $ = await this.fetchHtml(url);

    const h1 = $('h1.h1titre').first().clone();
    h1.find('a.buttonlike').remove();
    const title = h1.text().trim() || $('div.image_fiche img').attr('alt') || '';

    let original_title = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Titre original')) {
        original_title = t.replace('Titre original :', '').trim();
        return false;
      }
    });

    let start_date = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Origine :')) {
        const span = $(li).find("span[itemprop='datePublished']").first();
        if (span.length) start_date = span.attr('content') || span.text().trim();
        return false;
      }
    });

    let type = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Type :')) {
        type = t.replace('Type :', '').trim();
        return false;
      }
    });

    const genres = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Genres :')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find("a span[itemprop='genre']").map((_, s) => $(s).text().trim()).get();
    })();

    const themes = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Thèmes :')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find('a').map((_, s) => $(s).text().trim()).get();
    })();

    const authors = (() => {
      let liNode: any;
      $('li').each((_, li) => { const t = $(li).text(); if (t && t.includes('Auteur :') || t.includes('Auteurs :')) { liNode = li; return false; } });
      if (!liNode) return [] as string[];
      return $(liNode).find("span[itemprop='author'] span[itemprop='name']").map((_, s) => $(s).text().trim()).get();
    })();

    let publisher_vo = '';
    let publisher_vf = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Éditeur VO :')) {
        publisher_vo = $(li).find("span[itemprop='legalName']").first().text().trim();
      }
      if (t && t.includes('Éditeur VF :')) {
        publisher_vf = $(li).find("span[itemprop='legalName']").first().text().trim();
      }
    });

    let volumes_vo = '';
    let volumes_vf = '';
    let status = '';
    $('li').each((_, li) => {
      const t = $(li).text();
      if (t && t.includes('Nb volumes VO :')) {
        volumes_vo = t.replace('Nb volumes VO :', '').trim();
        if (volumes_vo.includes('Terminé')) status = 'Terminé';
        else if (volumes_vo.includes('En cours')) status = 'En cours';
      }
      if (t && t.includes('Nb volumes VF :')) {
        volumes_vf = t.replace('Nb volumes VF :', '').trim();
      }
    });

    const synopsisNode = $('div.description').first().clone();
    synopsisNode.find('div.fader').remove();
    const synopsis = synopsisNode.text().trim();

    let imageUrl = '';
    const imageElement = $('.image_fiche img').first();
    if (imageElement.length) {
      const imgSrc = imageElement.attr('src');
      if (imgSrc) {
        let fullUrl = imgSrc;
        if (imgSrc.startsWith('/')) {
          fullUrl = `https://www.nautiljon.com${imgSrc}`;
        }
        imageUrl = fullUrl.split('?')[0];
        if (imageUrl.includes('/mini/')) {
          imageUrl = imageUrl.replace('/mini/', '/');
        }
      }
    }

    return {
      source: 'nautiljon',
      url,
      title,
      original_title,
      start_date,
      type,
      genres,
      themes,
      authors,
      publisher_vo,
      publisher_vf,
      volumes_vo,
      volumes_vf,
      status,
      synopsis,
      image_url: imageUrl,
    };
  }
}
