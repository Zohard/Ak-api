import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';

@Injectable()
export class EpisodesService {
    private readonly logger = new Logger(EpisodesService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAllByAnimeId(animeId: number) {
        return this.prisma.akAnimesEpisode.findMany({
            where: { idAnime: animeId },
            orderBy: { numero: 'asc' },
        });
    }

    private sanitizeString(str: any): string | null {
        if (str === null || str === undefined) return null;
        const strValue = typeof str === 'string' ? str : String(str);
        // Remove null bytes and control characters
        const buffer = Buffer.from(strValue, 'utf8');
        const cleanedBytes = [...buffer].filter(b => b !== 0 && (b >= 0x20 || b === 0x09 || b === 0x0A || b === 0x0D));
        return Buffer.from(cleanedBytes).toString('utf8').trim() || null;
    }

    async syncEpisodes(animeId: number, episodesData: any[]) {
        this.logger.log(`Syncing ${episodesData.length} episodes for anime ${animeId}`);

        return this.prisma.$transaction(async (tx) => {
            const results = [];

            for (const ep of episodesData) {
                // Simple null byte removal - no complex buffer operations
                const cleanString = (str: any): string | null => {
                    if (!str) return null;
                    return String(str).replace(/\0/g, '').trim() || null;
                };

                const titleNative = cleanString(ep.media?.title?.native);
                const titleEnglish = cleanString(ep.media?.title?.english);
                const titleRomaji = cleanString(ep.media?.title?.romaji);
                const image = cleanString(ep.media?.coverImage?.large);

                // Format date as YYYY-MM-DD for VARCHAR(10) column
                let dateDiffusionStr: string | null = null;
                if (ep.airingAt) {
                    const date = new Date(ep.airingAt * 1000);
                    if (!isNaN(date.getTime())) {
                        dateDiffusionStr = date.toISOString().split('T')[0];
                    }
                }

                const existing = await tx.akAnimesEpisode.findFirst({
                    where: { idAnime: animeId, numero: ep.episode },
                });

                if (existing) {
                    const updated = await tx.akAnimesEpisode.update({
                        where: { idEpisode: existing.idEpisode },
                        data: {
                            dateDiffusion: dateDiffusionStr,
                            image: image || undefined,
                        },
                    });
                    results.push(updated);
                } else {
                    const created = await tx.akAnimesEpisode.create({
                        data: {
                            idAnime: animeId,
                            numero: ep.episode,
                            titreOriginal: titleNative,
                            titreJp: titleNative || `Episode ${ep.episode}`,
                            titreFr: null,
                            titreEn: titleEnglish || titleRomaji,
                            dateDiffusion: dateDiffusionStr,
                            image: image,
                            duration: null,
                            dateAjout: new Date(),
                        },
                    });
                    results.push(created);
                }
            }

            return results;
        });
    }
}
