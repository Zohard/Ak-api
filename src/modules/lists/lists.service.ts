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
  ) {}

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

  async getUserLists(userId: number, type?: 'liste' | 'top' | 'top1', mediaType?: 'anime' | 'manga') {
    const rows = await this.prisma.akListesTop.findMany({
      where: {
        idMembre: userId,
        ...(type ? { type } : {}),
        ...(mediaType ? { animeOrManga: mediaType } : {}),
      },
      orderBy: { idListe: 'desc' },
      include: { membre: { select: { idMember: true, memberName: true } } },
    });
    return rows.map((r) => this.formatList(r));
  }

  async createList(userId: number, dto: CreateListDto) {
    const now = new Date();
    const list = await this.prisma.akListesTop.create({
      data: {
        titre: dto.titre,
        presentation: dto.presentation,
        type: dto.type,
        animeOrManga: dto.animeOrManga,
        jsonData: dto.jsonData || '[]',
        jsonDataCom: dto.jsonDataCom || '[]',
        statut: dto.statut ?? 0,
        idMembre: userId,
        dateCreation: now,
        nbClics: 0,
        jaime: '',
        jaimepas: '',
        popularite: 0,
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
      },
    });
    
    // Invalidate cache if the list is public or was made public/private
    if ((existing.statut === 1 || updated.statut === 1) && updated.animeOrManga) {
      await this.cacheService.invalidatePublicLists(updated.animeOrManga as 'anime' | 'manga');
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
      await this.cacheService.invalidatePublicLists(existing.animeOrManga as 'anime' | 'manga');
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

  async getPublicLists(mediaType: 'anime' | 'manga', sort: 'recent' | 'popular' = 'recent', limit = 10) {
    // Check cache first
    const cachedLists = await this.cacheService.getPublicLists(mediaType, sort, limit);
    if (cachedLists) {
      return cachedLists;
    }

    let result: any[];

    if (sort === 'recent') {
      const rows = await this.prisma.akListesTop.findMany({
        where: { statut: 1, animeOrManga: mediaType },
        orderBy: { dateCreation: 'desc' },
        take: limit,
        include: { membre: { select: { idMember: true, memberName: true } } },
      });
      result = rows.map((r) => this.formatList(r));
    } else {
      // Popular: compute popularity score on the fly and sort in JS
      const lists = await this.prisma.akListesTop.findMany({
        where: { statut: 1, animeOrManga: mediaType },
        orderBy: { idListe: 'desc' },
        take: 100,
        include: { membre: { select: { idMember: true, memberName: true } } },
      });
      const scored = lists
        .map((l) => ({ ...l, popularityScore: this.calculatePopularity(l.jaime, l.jaimepas, l.nbClics) }))
        .sort((a, b) => b.popularityScore - a.popularityScore)
        .slice(0, limit);
      result = scored.map((r) => this.formatList(r));
    }

    // Cache the result for 4 hours
    await this.cacheService.setPublicLists(mediaType, sort, limit, result);
    
    return result;
  }
  async getPublicListsPaged(mediaType: 'anime' | 'manga', sort: 'recent' | 'popular' = 'recent', type?: 'liste' | 'top', page = 1, limit = 30) {
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
    const items = rows.map((r) => this.formatList(r));
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const result = { items, page, limit, total, totalPages };

    // Cache the result for 5 minutes
    await this.cacheService.setPublicListsPaged(mediaType, sort, type || '', page, limit, result);

    return result;
  }

  async getById(id: number) {
    const list = await this.prisma.akListesTop.findUnique({ where: { idListe: id }, include: { membre: { select: { idMember: true, memberName: true } } } });
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
      membre: row.membre ? { id: row.membre.idMember, pseudo: row.membre.memberName } : undefined,
    };
  }
}
