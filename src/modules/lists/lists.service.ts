import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';

@Injectable()
export class ListsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) { }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 100); // Limit length
  }

  private calculatePopularity(jaime?: string | null, jaimepas?: string | null, nb_clics = 0): number {
    const likes = (jaime || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length;
    const dislikes = (jaimepas || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length;
    const totalVotes = likes + dislikes;
    const ratio = totalVotes > 0 ? likes / totalVotes : 0;
    const viewsWeight = Math.log((nb_clics || 0) + 1) / 10; // Normalized logarithmic
    return Number(((ratio * 0.7) + (viewsWeight * 0.3)).toFixed(4));
  }

  private async batchFetchFirstItemImages(rows: any[]): Promise<Map<number, string>> {
    // Extract first item IDs and batch fetch their images
    const animeIds: number[] = [];
    const mangaIds: number[] = [];
    const gameIds: number[] = [];
    const listFirstItemMap = new Map<number, { id: number; type: 'anime' | 'manga' | 'jeu-video' }>();

    for (const row of rows) {
      try {
        const jsonData = JSON.parse(row.jsonData || '[]');
        if (Array.isArray(jsonData) && jsonData.length > 0) {
          const firstId = parseInt(String(jsonData[0]), 10);
          if (!isNaN(firstId)) {
            listFirstItemMap.set(row.idListe, { id: firstId, type: row.animeOrManga as 'anime' | 'manga' | 'jeu-video' });
            if (row.animeOrManga === 'anime') {
              animeIds.push(firstId);
            } else if (row.animeOrManga === 'manga') {
              mangaIds.push(firstId);
            } else if (row.animeOrManga === 'jeu-video') {
              gameIds.push(firstId);
            }
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Batch fetch anime and manga images
    const animeImages = new Map<number, string>();
    const mangaImages = new Map<number, string>();
    const gameImages = new Map<number, string>();

    if (animeIds.length > 0) {
      const animes = await this.prisma.akAnime.findMany({
        where: { idAnime: { in: animeIds } },
        select: { idAnime: true, image: true }
      });
      for (const anime of animes) {
        if (anime.image) animeImages.set(anime.idAnime, anime.image);
      }
    }

    if (mangaIds.length > 0) {
      const mangas = await this.prisma.akManga.findMany({
        where: { idManga: { in: mangaIds } },
        select: { idManga: true, image: true }
      });
      for (const manga of mangas) {
        if (manga.image) mangaImages.set(manga.idManga, manga.image);
      }
    }

    if (gameIds.length > 0) {
      const games = await this.prisma.akJeuxVideo.findMany({
        where: { idJeu: { in: gameIds } },
        select: { idJeu: true, image: true }
      });
      for (const game of games) {
        if (game.image) gameImages.set(game.idJeu, game.image);
      }
    }

    // Map images back to lists
    const resultMap = new Map<number, string>();
    for (const [listId, firstItem] of listFirstItemMap.entries()) {
      let imageMap: Map<number, string>;
      if (firstItem.type === 'anime') imageMap = animeImages;
      else if (firstItem.type === 'manga') imageMap = mangaImages;
      else imageMap = gameImages;

      const image = imageMap.get(firstItem.id);
      if (image) {
        resultMap.set(listId, image);
      }
    }

    return resultMap;
  }

  async getListsByMedia(mediaType: string, mediaId: number) {
    const mediaIdStr = `"${mediaId}"`;
    const rows = await this.prisma.akListesTop.findMany({
      where: {
        statut: 1,
        animeOrManga: mediaType,
        jsonData: {
          contains: mediaIdStr,
        },
      },
      orderBy: { popularite: 'desc' },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
          },
        },
      },
    });

    // Batch fetch first item images
    const imageMap = await this.batchFetchFirstItemImages(rows);

    // Map images to lists
    return rows.map((r) => {
      const formatted = this.formatList(r) as any;
      formatted.firstItemImage = imageMap.get(r.idListe) || null;
      return formatted;
    });
  }

  async getUserLists(userId: number, type?: 'liste' | 'top' | 'top1', mediaType?: 'anime' | 'manga' | 'jeu-video') {
    const rows = await this.prisma.akListesTop.findMany({
      where: {
        idMembre: userId,
        ...(type ? { type } : {}),
        ...(mediaType ? { animeOrManga: mediaType } : {}),
      },
      orderBy: { idListe: 'desc' },
      include: { membre: { select: { idMember: true, memberName: true } } },
    });

    // Batch fetch first item images
    const imageMap = await this.batchFetchFirstItemImages(rows);

    // Map images to lists
    return rows.map((r) => {
      const formatted = this.formatList(r) as any;
      formatted.firstItemImage = imageMap.get(r.idListe) || null;
      return formatted;
    });
  }

  async createList(userId: number, dto: CreateListDto) {
    const now = new Date();
    const baseSlug = this.generateSlug(dto.titre);
    const timestamp = Date.now();
    const niceUrl = `${baseSlug}-${timestamp}`;

    const list = await this.prisma.akListesTop.create({
      data: {
        titre: dto.titre,
        presentation: dto.presentation || '',
        type: dto.type,
        animeOrManga: dto.animeOrManga,
        jsonData: dto.jsonData || '[]',
        jsonDataCom: dto.jsonDataCom || '[]',
        statut: dto.statut ?? 0,
        idMembre: userId,
        dateCreation: now,
        dateModification: now,
        nbClics: 0,
        nbClicsDay: 0,
        nbClicsWeek: 0,
        nbClicsMonth: 0,
        jaime: '',
        jaimepas: '',
        popularite: 0,
        variationPopularite: 'NEW',
        score: 0,
        niceUrl: niceUrl,
      },
    });

    // Invalidate cache when a new public list is created
    if (list.statut === 1) {
      await this.cacheService.invalidatePublicLists(dto.animeOrManga);
    }

    return this.formatList(list);
  }

  async updateList(id: number, userId: number, dto: UpdateListDto) {
    const existing = await this.prisma.akListesTop.findUnique({ where: { idListe: id } });
    if (!existing) throw new NotFoundException('List not found');
    if (existing.idMembre !== userId) throw new ForbiddenException('Not your list');

    const updated = await this.prisma.akListesTop.update({
      where: { idListe: id },
      data: {
        titre: dto.titre ?? existing.titre,
        presentation: dto.presentation ?? existing.presentation,
        type: dto.type ?? existing.type,
        animeOrManga: dto.animeOrManga ?? existing.animeOrManga,
        jsonData: dto.jsonData ?? existing.jsonData,
        jsonDataCom: dto.jsonDataCom ?? existing.jsonDataCom,
        statut: dto.statut ?? existing.statut,
        dateModification: new Date(),
      },
    });

    // Invalidate cache if the list is public or was made public/private
    if ((existing.statut === 1 || updated.statut === 1) && updated.animeOrManga) {
      await this.cacheService.invalidatePublicLists(updated.animeOrManga as 'anime' | 'manga' | 'jeu-video');
    }

    return this.formatList(updated);
  }

  async deleteList(id: number, userId: number) {
    const existing = await this.prisma.akListesTop.findUnique({ where: { idListe: id } });
    if (!existing) throw new NotFoundException('List not found');
    if (existing.idMembre !== userId) throw new ForbiddenException('Not your list');

    await this.prisma.akListesTop.delete({ where: { idListe: id } });

    // Invalidate cache when a public list is deleted
    if (existing.statut === 1 && existing.animeOrManga) {
      await this.cacheService.invalidatePublicLists(existing.animeOrManga as 'anime' | 'manga' | 'jeu-video');
    }

    return { success: true };
  }

  async updateItems(id: number, userId: number, items: string[], comments?: string[]) {
    const existing = await this.prisma.akListesTop.findUnique({ where: { idListe: id } });
    if (!existing) throw new NotFoundException('List not found');
    if (existing.idMembre !== userId) throw new ForbiddenException('Not your list');

    const jsonData = JSON.stringify(items || []);
    const jsonDataCom = JSON.stringify(comments || []);
    const updated = await this.prisma.akListesTop.update({
      where: { idListe: id },
      data: { jsonData, jsonDataCom },
    });
    return this.formatList(updated);
  }

  async getPublicLists(mediaType: 'anime' | 'manga' | 'jeu-video', sort: 'recent' | 'popular' = 'recent', limit = 10) {
    // Check cache first
    const cachedLists = await this.cacheService.getPublicLists(mediaType, sort, limit);
    if (cachedLists) {
      return cachedLists;
    }

    let result: any[];

    if (sort === 'recent') {
      const rows = await this.prisma.akListesTop.findMany({
        where: {
          statut: 1,
          animeOrManga: mediaType,
          membre: { idMember: { gt: 0 } }
        },
        orderBy: { dateCreation: 'desc' },
        take: limit,
        include: { membre: { select: { idMember: true, memberName: true } } },
      });
      result = rows.map((r) => this.formatList(r));
    } else {
      // Popular: use pre-calculated popularite field and sort at database level
      const rows = await this.prisma.akListesTop.findMany({
        where: {
          statut: 1,
          animeOrManga: mediaType,
          membre: { idMember: { gt: 0 } }
        },
        orderBy: [
          { popularite: 'desc' },
          { dateCreation: 'desc' }  // tiebreaker for same popularity
        ],
        take: limit,
        include: { membre: { select: { idMember: true, memberName: true } } },
      });
      result = rows.map((r) => this.formatList(r));
    }

    // Cache the result for 4 hours
    await this.cacheService.setPublicLists(mediaType, sort, limit, result);

    return result;
  }
  async getPublicListsPaged(mediaType: 'anime' | 'manga' | 'jeu-video', sort: 'recent' | 'popular' = 'recent', type?: 'liste' | 'top', page = 1, limit = 30) {
    // Check cache first
    const cachedResult = await this.cacheService.getPublicListsPaged(mediaType, sort, type || '', page, limit);
    if (cachedResult) {
      return cachedResult;
    }

    const where: any = {
      statut: 1,
      animeOrManga: mediaType,
      ...(type ? { type } : {}),
      membre: { idMember: { gt: 0 } }
    };
    const skip = (page - 1) * limit;
    const orderBy: any = sort === 'recent'
      ? { dateCreation: 'desc' }
      : [{ popularite: 'desc' }, { dateCreation: 'desc' }];
    const [total, rows] = await Promise.all([
      this.prisma.akListesTop.count({ where }),
      this.prisma.akListesTop.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          membre: {
            select: { idMember: true, memberName: true }
          }
        }
      }),
    ]);

    // Batch fetch first item images
    const imageMap = await this.batchFetchFirstItemImages(rows);

    // Map images to lists
    const items = rows.map((r) => {
      const formatted = this.formatList(r) as any;
      formatted.firstItemImage = imageMap.get(r.idListe) || null;
      return formatted;
    });

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const result = { items, page, limit, total, totalPages };

    // Cache the result for 20 minutes (1200 seconds)
    await this.cacheService.setPublicListsPaged(mediaType, sort, type || '', page, limit, result, 1200);

    return result;
  }

  async getById(id: number) {
    const list = await this.prisma.akListesTop.findUnique({
      where: { idListe: id },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            realName: true,
            avatar: true,
            dateRegistered: true,
            lastLogin: true,
            location: true,
            personalText: true
          }
        }
      }
    });
    if (!list) throw new NotFoundException('List not found');
    return this.formatList(list);
  }

  async incrementView(id: number) {
    const updated = await this.prisma.akListesTop.update({
      where: { idListe: id },
      data: { nbClics: { increment: 1 } },
    });
    const popularity = this.calculatePopularity(updated.jaime, updated.jaimepas, updated.nbClics);
    await this.prisma.akListesTop.update({ where: { idListe: id }, data: { popularite: popularity } });
    return { nb_clics: updated.nbClics, popularite: popularity };
  }

  private parseVotes(csv?: string | null): number[] {
    return (csv || '')
      .split(',')
      .map((s) => parseInt(s))
      .filter((n) => !isNaN(n) && n > 0);
  }

  private toCsv(ids: number[]): string {
    return ids.join(',');
  }

  async like(id: number, userId: number) {
    const list = await this.getById(id);
    if (list.id_membre === userId) throw new ForbiddenException('Cannot vote on your own list');

    const likes = new Set(this.parseVotes(list.jaime));
    const dislikes = new Set(this.parseVotes(list.jaimepas));
    dislikes.delete(userId);
    if (likes.has(userId)) likes.delete(userId); else likes.add(userId);

    const updated = await this.prisma.akListesTop.update({
      where: { idListe: id },
      data: { jaime: this.toCsv([...likes]), jaimepas: this.toCsv([...dislikes]) },
    });
    const popularity = this.calculatePopularity(updated.jaime, updated.jaimepas, updated.nbClics);
    await this.prisma.akListesTop.update({ where: { idListe: id }, data: { popularite: popularity } });
    return { jaime: updated.jaime, jaimepas: updated.jaimepas, popularite: popularity };
  }

  async dislike(id: number, userId: number) {
    const list = await this.getById(id);
    if (list.id_membre === userId) throw new ForbiddenException('Cannot vote on your own list');

    const likes = new Set(this.parseVotes(list.jaime));
    const dislikes = new Set(this.parseVotes(list.jaimepas));
    likes.delete(userId);
    if (dislikes.has(userId)) dislikes.delete(userId); else dislikes.add(userId);

    const updated = await this.prisma.akListesTop.update({
      where: { idListe: id },
      data: { jaime: this.toCsv([...likes]), jaimepas: this.toCsv([...dislikes]) },
    });
    const popularity = this.calculatePopularity(updated.jaime, updated.jaimepas, updated.nbClics);
    await this.prisma.akListesTop.update({ where: { idListe: id }, data: { popularite: popularity } });
    return { jaime: updated.jaime, jaimepas: updated.jaimepas, popularite: popularity };
  }

  async removeLike(id: number, userId: number) {
    const list = await this.getById(id);
    const likes = this.parseVotes(list.jaime).filter((u) => u !== userId);
    const updated = await this.prisma.akListesTop.update({ where: { idListe: id }, data: { jaime: this.toCsv(likes) } });
    const popularity = this.calculatePopularity(updated.jaime, updated.jaimepas, updated.nbClics);
    await this.prisma.akListesTop.update({ where: { idListe: id }, data: { popularite: popularity } });
    return { jaime: updated.jaime, jaimepas: updated.jaimepas, popularite: popularity };
  }

  async removeDislike(id: number, userId: number) {
    const list = await this.getById(id);
    const dislikes = this.parseVotes(list.jaimepas).filter((u) => u !== userId);
    const updated = await this.prisma.akListesTop.update({ where: { idListe: id }, data: { jaimepas: this.toCsv(dislikes) } });
    const popularity = this.calculatePopularity(updated.jaime, updated.jaimepas, updated.nbClics);
    await this.prisma.akListesTop.update({ where: { idListe: id }, data: { popularite: popularity } });
    return { jaime: updated.jaime, jaimepas: updated.jaimepas, popularite: popularity };
  }

  async stats(id: number) {
    const list = await this.getById(id);
    const likes = this.parseVotes(list.jaime).length;
    const dislikes = this.parseVotes(list.jaimepas).length;
    const popularity = this.calculatePopularity((list as any).jaime, (list as any).jaimepas, (list as any).nb_clics);
    return { likes, dislikes, nb_clics: (list as any).nb_clics, popularite: popularity };
  }

  async getVotes(id: number) {
    // Get fresh vote data (not cached) - used for real-time vote count updates
    const list = await this.prisma.akListesTop.findUnique({
      where: { idListe: id },
      select: { jaime: true, jaimepas: true }
    });

    if (!list) {
      throw new NotFoundException(`Liste ${id} introuvable`);
    }

    const likes = this.parseVotes(list.jaime).length;
    const dislikes = this.parseVotes(list.jaimepas).length;

    return {
      likes,
      dislikes,
      jaime: list.jaime || '',
      jaimepas: list.jaimepas || ''
    };
  }

  async recalculateAllPopularity() {
    // Utility method to recalculate popularity for all public lists
    const lists = await this.prisma.akListesTop.findMany({
      where: { statut: 1 }
    });

    for (const list of lists) {
      const popularity = this.calculatePopularity(list.jaime, list.jaimepas, list.nbClics);
      await this.prisma.akListesTop.update({
        where: { idListe: list.idListe },
        data: { popularite: popularity }
      });
    }

    return { updated: lists.length };
  }

  private decodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  private formatList(row: any) {
    return {
      id_liste: row.idListe,
      id_membre: row.idMembre,
      titre: row.titre,
      presentation: row.presentation,
      type: row.type,
      anime_or_manga: row.animeOrManga,
      json_data: row.jsonData,
      json_data_com: row.jsonDataCom,
      jaime: row.jaime,
      jaimepas: row.jaimepas,
      nb_clics: row.nbClics,
      popularite: row.popularite,
      statut: row.statut,
      date_creation: row.dateCreation,
      membre: row.membre ? {
        id: row.membre.idMember,
        pseudo: row.membre.memberName,
        username: row.membre.memberName,
        realName: row.membre.realName,
        avatar: row.membre.avatar,
        dateInscription: row.membre.dateRegistered,
        lastLogin: row.membre.lastLogin,
        location: this.decodeHtmlEntities(row.membre.location),
        personalText: this.decodeHtmlEntities(row.membre.personalText)
      } : undefined,
    };
  }
}
