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
        // Convert to string if not already
        const strValue = typeof str === 'string' ? str : String(str);

        // Multiple sanitization approaches to catch all null bytes:
        // 1. Replace via regex (catches Unicode null)
        let sanitized = strValue.replace(/\0/g, '');

        // 2. Split by null and rejoin (catches embedded nulls)
        sanitized = sanitized.split('\0').join('');
        sanitized = sanitized.split('\u0000').join('');
        sanitized = sanitized.split(String.fromCharCode(0)).join('');

        // 3. Filter characters by code point
        sanitized = [...sanitized].filter(char => char.charCodeAt(0) !== 0).join('');

        // 4. Remove other control characters (0x01-0x08, 0x0B, 0x0C, 0x0E-0x1F)
        sanitized = sanitized.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');

        // 5. Final Buffer-based check for any remaining null bytes
        const buffer = Buffer.from(sanitized, 'utf8');
        if (buffer.includes(0)) {
            const cleanedBytes = [...buffer].filter(b => b !== 0);
            sanitized = Buffer.from(cleanedBytes).toString('utf8');
        }

        return sanitized.trim() || null;
    }

    private sanitizeObject(obj: Record<string, any>): Record<string, any> {
        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    async syncEpisodes(animeId: number, episodesData: any[]) {
        this.logger.log(`Syncing ${episodesData.length} episodes for anime ${animeId}`);

        // We use a transaction to ensure data integrity
        return this.prisma.$transaction(async (tx) => {
            // 1. Delete existing future episodes (to handle reschedules) or update existing?
            // A simple strategy is to upsert based on animeId + episodeNumber.

            const results = [];

            for (const ep of episodesData) {
                // Prepare data - titles are nested in media.title from AniList airingSchedule
                const sanitizedTitleNative = this.sanitizeString(ep.media?.title?.native);
                const sanitizedTitleEnglish = this.sanitizeString(ep.media?.title?.english);
                const sanitizedTitleRomaji = this.sanitizeString(ep.media?.title?.romaji);
                const sanitizedImage = this.sanitizeString(ep.media?.coverImage?.large);

                // Log the raw and sanitized values for debugging with hex dump
                const rawNative = ep.media?.title?.native;
                if (rawNative) {
                    const rawHex = Buffer.from(rawNative, 'utf8').toString('hex');
                    this.logger.log(`Episode ${ep.episode} - Raw native hex: ${rawHex}`);
                }
                this.logger.log(`Episode ${ep.episode} - Sanitized native: ${sanitizedTitleNative}`);

                const data = {
                    idAnime: animeId,
                    numero: ep.episode,
                    titreOriginal: sanitizedTitleNative,
                    titreJp: sanitizedTitleNative || `Episode ${ep.episode}`,
                    titreFr: null as string | null,
                    titreEn: sanitizedTitleEnglish || sanitizedTitleRomaji,
                    dateDiffusion: new Date(ep.airingAt * 1000),
                    image: sanitizedImage,
                    duration: null as number | null
                };

                // Double-sanitize all string fields before insert
                const sanitizedData = this.sanitizeObject(data) as typeof data;

                // Try to find if episode exists
                const existing = await tx.akAnimesEpisode.findFirst({
                    where: {
                        idAnime: animeId,
                        numero: ep.episode,
                    },
                });

                if (existing) {
                    // Update
                    const updated = await tx.akAnimesEpisode.update({
                        where: { idEpisode: existing.idEpisode },
                        data: {
                            dateDiffusion: sanitizedData.dateDiffusion,
                            image: sanitizedData.image ? sanitizedData.image : undefined,
                        },
                    });
                    results.push(updated);
                } else {
                    // Create - try with minimal data first to isolate the issue
                    try {
                        // Build the insert data field by field to identify which one has the null byte
                        const insertData: any = {
                            idAnime: animeId,
                            numero: ep.episode,
                            titreJp: `Episode ${ep.episode}`, // Safe fallback first
                            dateAjout: new Date(),
                        };

                        // Add optional string fields one by one with explicit null byte check
                        const stringFields = {
                            titreOriginal: sanitizedData.titreOriginal,
                            titreJp: sanitizedData.titreJp,
                            titreFr: sanitizedData.titreFr,
                            titreEn: sanitizedData.titreEn,
                            image: sanitizedData.image,
                        };

                        for (const [fieldName, fieldValue] of Object.entries(stringFields)) {
                            if (fieldValue !== null && fieldValue !== undefined) {
                                // Final paranoid check for null bytes
                                const strVal = String(fieldValue);
                                const hasNull = strVal.includes('\0') ||
                                    Buffer.from(strVal, 'utf8').includes(0);

                                if (hasNull) {
                                    this.logger.error(`NULL BYTE FOUND in ${fieldName}: ${Buffer.from(strVal, 'utf8').toString('hex')}`);
                                    // Skip this field entirely
                                    continue;
                                }
                                insertData[fieldName] = strVal;
                            }
                        }

                        // Add date field
                        if (sanitizedData.dateDiffusion) {
                            insertData.dateDiffusion = sanitizedData.dateDiffusion;
                        }

                        this.logger.log(`Creating episode ${ep.episode} with data: ${JSON.stringify(insertData)}`);

                        const created = await tx.akAnimesEpisode.create({
                            data: insertData,
                        });
                        results.push(created);
                    } catch (createError) {
                        this.logger.error(`Failed to create episode ${ep.episode}: ${createError.message}`);
                        // Log hex dump of all string fields to find the null byte
                        for (const [key, value] of Object.entries(sanitizedData)) {
                            if (typeof value === 'string') {
                                const hex = Buffer.from(value, 'utf8').toString('hex');
                                const hasNullByte = hex.includes('00');
                                this.logger.error(`Field ${key}: "${value}" | Hex: ${hex} | Has null: ${hasNullByte}`);
                            }
                        }
                        throw createError;
                    }
                }
            }

            return results;
        });
    }
}
