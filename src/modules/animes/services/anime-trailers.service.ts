import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { AdminLoggingService } from '../../../shared/services/admin-logging.service';

@Injectable()
export class AnimeTrailersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly adminLoggingService: AdminLoggingService,
  ) {}

  async createTrailer(createTrailerDto: any, username?: string) {
    // Verify anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: createTrailerDto.idAnime },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    const trailer = await this.prisma.akAnimesTrailer.create({
      data: {
        idAnime: createTrailerDto.idAnime,
        titre: createTrailerDto.titre,
        url: createTrailerDto.url,
        platform: createTrailerDto.platform,
        langue: createTrailerDto.langue || 'ja',
        typeTrailer: createTrailerDto.typeTrailer || 'PV',
        ordre: createTrailerDto.ordre || 0,
        statut: createTrailerDto.statut !== undefined ? createTrailerDto.statut : 1,
      },
    });

    // Log activity
    if (username) {
      await this.adminLoggingService.addLog(
        createTrailerDto.idAnime,
        'anime',
        username,
        `Ajout vidéo: ${trailer.titre || trailer.typeTrailer} (${trailer.platform})`
      );
    }

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(createTrailerDto.idAnime);

    return trailer;
  }

  async updateTrailer(trailerId: number, updateTrailerDto: any, username?: string) {
    const trailer = await this.prisma.akAnimesTrailer.findUnique({
      where: { idTrailer: trailerId },
    });

    if (!trailer) {
      throw new NotFoundException('Bande-annonce introuvable');
    }

    const updated = await this.prisma.akAnimesTrailer.update({
      where: { idTrailer: trailerId },
      data: updateTrailerDto,
    });

    // Log activity
    if (username) {
      await this.adminLoggingService.addLog(
        trailer.idAnime,
        'anime',
        username,
        `Modification vidéo: ${updated.titre || updated.typeTrailer} (${updated.platform})`
      );
    }

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(trailer.idAnime);

    return updated;
  }

  async removeTrailer(trailerId: number, username?: string) {
    const trailer = await this.prisma.akAnimesTrailer.findUnique({
      where: { idTrailer: trailerId },
    });

    if (!trailer) {
      throw new NotFoundException('Bande-annonce introuvable');
    }

    await this.prisma.akAnimesTrailer.delete({
      where: { idTrailer: trailerId },
    });

    // Log activity
    if (username) {
      await this.adminLoggingService.addLog(
        trailer.idAnime,
        'anime',
        username,
        `Suppression vidéo: ${trailer.titre || trailer.typeTrailer} (${trailer.platform})`
      );
    }

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(trailer.idAnime);
  }
}
