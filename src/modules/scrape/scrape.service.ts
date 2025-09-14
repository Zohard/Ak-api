import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { load } from 'cheerio';

type ScrapeSource = 'mal' | 'nautiljon' | 'auto';

@Injectable()
export class ScrapeService {
  private async fetchHtml(url: string) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AK-Scraper/1.0)'
      }
    });
    if (!res.ok) throw new BadRequestException(`Fetch failed ${res.status}`);
    const html = await res.text();
    return load(html);
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

    const yearFrom = (s?: string) => {
      if (!s) return '';
      const m = s.match(/(19|20)\d{2}/);
      return m ? m[0] : '';
    };
    const annee = yearFrom(mal?.aired) || yearFrom(nj?.airing_dates);

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
        nb_epduree: merged.episode_count,
        official_site: merged.official_sites[0] || '',
      },
    };
  }

  async scrapeAnime(q: string, source: ScrapeSource = 'auto') {
    if (!q?.trim()) throw new BadRequestException('Missing query q');

    let mal: any = null;
    let nj: any = null;

    if (source === 'mal') {
      mal = await this.scrapeMAL(q);
    } else if (source === 'nautiljon') {
      nj = await this.scrapeNautiljon(q);
    } else {
      try { mal = await this.scrapeMAL(q); } catch { /* ignore */ }
      try { nj = await this.scrapeNautiljon(q); } catch { /* ignore */ }
      if (!mal && !nj) throw new NotFoundException('No results from MAL or Nautiljon');
    }

    return this.mergeInfo(mal, nj);
  }
}
