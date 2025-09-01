import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';

@Injectable()
export class ListsService {
  constructor(private prisma: PrismaService) {}

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

  async getUserLists(userId: number, type?: 'liste' | 'top', mediaType?: 'anime' | 'manga') {
    const rows = await this.prisma.akListesTop.findMany({
      where: {
        idMembre: userId,
        ...(type ? { type } : {}),
        ...(mediaType ? { animeOrManga: mediaType } : {}),
      },
      orderBy: { idListe: 'desc' },
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
    return this.formatList(updated);
  }

  async deleteList(id: number, userId: number) {
    const existing = await this.prisma.akListesTop.findUnique({ where: { idListe: id } });
    if (!existing) throw new NotFoundException('List not found');
    if (existing.idMembre !== userId) throw new ForbiddenException('Not your list');

    await this.prisma.akListesTop.delete({ where: { idListe: id } });
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
    if (sort === 'recent') {
      const rows = await this.prisma.akListesTop.findMany({
        where: { statut: 1, animeOrManga: mediaType },
        orderBy: { dateCreation: 'desc' },
        take: limit,
      });
      return rows.map((r) => this.formatList(r));
    }

    // Popular: compute popularity score on the fly and sort in JS
    const lists = await this.prisma.akListesTop.findMany({
      where: { statut: 1, animeOrManga: mediaType },
      orderBy: { idListe: 'desc' },
      take: 100,
    });
    const scored = lists
      .map((l) => ({ ...l, popularityScore: this.calculatePopularity(l.jaime, l.jaimepas, l.nbClics) }))
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, limit);
    return scored.map((r) => this.formatList(r));
  }

  async getById(id: number) {
    const list = await this.prisma.akListesTop.findUnique({ where: { idListe: id } });
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
    };
  }
}
