import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { AnimesService } from '../animes/animes.service';

@Injectable()
export class GamesService {
    constructor(
        private prisma: PrismaService,
        private animesService: AnimesService,
    ) { }

    /**
     * Gets today's game ID/number based on a reference date.
     */
    getGameNumber(): number {
        const epoch = Date.UTC(2026, 1, 20); // Feb 20 2026 UTC midnight
        const now = new Date();
        const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return Math.floor((todayUTC - epoch) / (24 * 60 * 60 * 1000));
    }

    /**
     * Selects a target anime for the day based on the game number.
     * Filters for published animes with a popularity rank to ensure it's guessable.
     */
    async getDailyTarget(forGameNumber?: number) {
        const gameNumber = forGameNumber ?? this.getGameNumber();

        // Get a stable list of candidate animes (published and relatively popular)
        const candidates = await this.prisma.akAnime.findMany({
            where: {
                statut: 1,
                classementPopularite: { gt: 0, lte: 2000 }, // Top 2000 animes
            },
            select: { idAnime: true },
            orderBy: { idAnime: 'asc' },
        });

        if (candidates.length === 0) {
            throw new NotFoundException('Aucun anime candidat trouvé pour le jeu');
        }

        // Pick one based on the game number
        const index = gameNumber % candidates.length;
        const targetId = candidates[index].idAnime;

        // Fetch full details
        return this.animesService.findOne(targetId);
    }

    /**
     * Compares a guessed anime with the daily target and optionally saves progress.
     */
    /**
     * Returns true if two animes share the same franchise group (ak_fiche_to_fiche)
     * AND have the same format — e.g. two films from the same series.
     */
    private async areRelatedAnimes(guessId: number, targetId: number, guessFormat: string | null, targetFormat: string | null): Promise<boolean> {
        if (!guessFormat || !targetFormat || guessFormat !== targetFormat) return false;

        const rows = await this.prisma.akFicheToFiche.findMany({
            where: { idAnime: { in: [guessId, targetId] } },
            select: { idFicheDepart: true, idAnime: true },
        });

        const guessGroups = new Set(rows.filter(r => r.idAnime === guessId).map(r => r.idFicheDepart));
        const targetGroups = rows.filter(r => r.idAnime === targetId).map(r => r.idFicheDepart);

        return targetGroups.some(g => guessGroups.has(g));
    }

    async compareGuess(animeId: number, userId?: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const target = await this.getDailyTarget(gn);
        const guess = await this.animesService.findOne(animeId);

        if (!guess) {
            throw new NotFoundException('Anime deviné introuvable');
        }

        const isCorrect = guess.id === target.id ||
            await this.areRelatedAnimes(guess.id, target.id, guess.format, target.format);

        const isRelated = isCorrect && guess.id !== target.id;

        const result = {
            anime: {
                id: guess.id,
                titre: guess.titre,
                image: guess.image,
                niceUrl: (guess as any).niceUrl ?? null,
            },
            ...(isRelated && {
                correctAnime: {
                    id: target.id,
                    titre: target.titre,
                    image: target.image,
                    niceUrl: (target as any).niceUrl ?? null,
                },
            }),
            comparison: {
                year: this.compareYear(guess.annee, target.annee),
                format: this.compareValue(guess.format, target.format),
                studio: this.compareValue(guess.studio, target.studio),
                episodes: this.compareEpisodes(guess.nbEp, target.nbEp),
                tags: this.compareTags(guess.tags, target.tags),
            },
            isCorrect,
        };

        // If user is logged in, sync with database and return streak
        if (userId) {
            const existing = await this.getUserScore(userId, gn);

            const guesses = existing ? [...(existing.guesses as any[]), result] : [result];
            await this.saveScore(userId, gn, guesses, result.isCorrect);

            const streak = await this.getUserStreak(userId);
            return { ...result, streak };
        }

        return result;
    }

    /**
     * Saves or updates a user's game score for a specific game.
     */
    async saveScore(userId: number, gameNumber: number, guesses: any[], isWon: boolean) {
        return this.prisma.akGuessGameScore.upsert({
            where: {
                userId_gameNumber: { userId, gameNumber },
            },
            update: {
                attempts: guesses.length,
                isWon,
                guesses,
            },
            create: {
                userId,
                gameNumber,
                attempts: guesses.length,
                isWon,
                guesses,
            },
        });
    }

    /**
     * Gets a user's score for a specific game number.
     */
    async getUserScore(userId: number, gameNumber: number) {
        return this.prisma.akGuessGameScore.findUnique({
            where: {
                userId_gameNumber: { userId, gameNumber },
            },
        });
    }

    /**
     * Calculates the user's current win streak.
     * A game is "lost" when attempts >= 10 and isWon is false — streak resets to 0.
     * An ongoing game (attempts < 10, not yet won) is excluded from the streak count.
     */
    async getUserStreak(userId: number): Promise<number> {
        const scores = await this.prisma.akGuessGameScore.findMany({
            where: { userId },
            orderBy: { gameNumber: 'desc' },
            select: { gameNumber: true, isWon: true, attempts: true },
        });

        if (scores.length === 0) return 0;

        const currentGame = this.getGameNumber();
        let streak = 0;
        // Start expecting the current game; if it's still ongoing we'll skip to yesterday
        let expectedGame = currentGame;

        for (const score of scores) {
            // Ignore future game numbers (shouldn't happen, but be safe)
            if (score.gameNumber > currentGame) continue;

            // If today's game is still in progress, don't count it yet
            if (score.gameNumber === currentGame && !score.isWon && score.attempts < 10) {
                expectedGame = currentGame - 1;
                continue;
            }

            // Gap in days — streak is broken
            if (score.gameNumber !== expectedGame) break;

            // Lost this game → streak resets to 0 and stops
            if (!score.isWon) {
                streak = 0;
                break;
            }

            streak++;
            expectedGame--;
        }

        return streak;
    }

    /**
     * Resolves the number of attempts to use for hint generation.
     * - Authenticated users: use their actual DB attempt count (tamper-proof).
     * - Anonymous users: use client-provided value, capped at 9 (answer never leaked).
     */
    async resolveAttempts(clientAttempts: number, userId: number | undefined, game: 'anime' | 'jeux' | 'screenshot' | 'manga', forGameNumber?: number): Promise<number> {
        if (userId) {
            const gn = forGameNumber ?? this.getGameNumber();
            let score: any;
            if (game === 'anime') score = await this.getUserScore(userId, gn);
            else if (game === 'jeux') score = await this.getUserScoreJeux(userId, gn);
            else if (game === 'manga') score = await this.getUserScoreManga(userId, gn);
            else score = await this.getUserScoreScreenshot(userId, gn);
            return score?.attempts ?? 0;
        }
        return Math.min(Number(clientAttempts) || 0, 9);
    }

    /**
     * Returns today's game score enriched with the user's current streak.
     */
    async getFullGameState(userId: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const [score, streak] = await Promise.all([
            this.getUserScore(userId, gn),
            this.getUserStreak(userId),
        ]);
        return { ...score, streak };
    }

    private compareYear(guess: number, target: number) {
        if (guess === target) return { status: 'correct', value: guess };
        if (Math.abs(guess - target) <= 2) return { status: 'partial', value: guess, direction: guess < target ? 'higher' : 'lower' };
        return { status: 'incorrect', value: guess, direction: guess < target ? 'higher' : 'lower' };
    }

    private compareValue(guess: any, target: any) {
        if (guess === target) return { status: 'correct', value: guess };
        return { status: 'incorrect', value: guess };
    }

    private compareEpisodes(guess: number, target: number) {
        if (guess === target) return { status: 'correct', value: guess };
        if (Math.abs(guess - target) <= 5) return { status: 'partial', value: guess, direction: guess < target ? 'higher' : 'lower' };
        return { status: 'incorrect', value: guess, direction: guess < target ? 'higher' : 'lower' };
    }

    private compareTags(guess: any[], target: any[]) {
        const guessTagNames = (guess || []).map(t => t.tag_name).filter(Boolean);
        const targetTagNames = (target || []).map(t => t.tag_name).filter(Boolean);

        const common = guessTagNames.filter(t => targetTagNames.includes(t));

        if (common.length === targetTagNames.length && guessTagNames.length === targetTagNames.length) {
            return { status: 'correct', common };
        }
        if (common.length > 0) {
            return { status: 'partial', common };
        }
        return { status: 'incorrect', common: [] };
    }

    /**
     * Returns hints based on the number of attempts.
     */
    async getHint(attempts: number, forGameNumber?: number) {
        const target = await this.getDailyTarget(forGameNumber);
        const hints: any = {};

        if (attempts >= 3) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 0, forGameNumber);
        }

        if (attempts >= 4) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 1, forGameNumber, { excludeFirstLetter: true });
        }

        if (attempts >= 5) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 2, forGameNumber, { excludeFirstLetter: true });
        }

        if (attempts >= 6) {
            hints.tags = (target.tags || []).map(t => t.tag_name).filter(Boolean);
        }

        if (attempts >= 7) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 2, forGameNumber, { excludeFirstLetter: true, alwaysRevealFirstLetter: true });
        }

        if (attempts >= 8) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 3, forGameNumber, { excludeFirstLetter: true, alwaysRevealFirstLetter: true });
        }

        if (attempts >= 9) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 4, forGameNumber, { excludeFirstLetter: true, alwaysRevealFirstLetter: true });
        }

        if (attempts >= 10) {
            hints.answer = target.titre;
        }

        return hints;
    }

    private generateMaskedTitle(
        title: string,
        revealCount: number,
        forGameNumber?: number,
        options?: { excludeFirstLetter?: boolean; alwaysRevealFirstLetter?: boolean },
    ): string {
        if (!title) return '';

        const chars = title.split('');
        const excludeFirstLetter = options?.excludeFirstLetter ?? false;
        const alwaysRevealFirstLetter = options?.alwaysRevealFirstLetter ?? false;

        const firstAlphaIndex = chars.findIndex(c => /[a-zA-Z0-9]/.test(c));

        // Collect indices that can be revealed (all alphanumeric characters)
        const revealableIndices: number[] = [];
        for (let i = 0; i < chars.length; i++) {
            if (/[a-zA-Z0-9]/.test(chars[i])) {
                if (excludeFirstLetter && i === firstAlphaIndex) continue;
                revealableIndices.push(i);
            }
        }

        // Pick indices deterministically using a seeded shuffle so hints are
        // consistent for the same game number across users and page reloads.
        const seed = (forGameNumber ?? this.getGameNumber()) + title.length;
        const shuffled = [...revealableIndices].sort((a, b) => {
            const ra = (Math.sin(seed * a + 1) + 1) / 2;
            const rb = (Math.sin(seed * b + 1) + 1) / 2;
            return ra - rb;
        });
        const revealedSet = new Set(shuffled.slice(0, revealCount));

        if (alwaysRevealFirstLetter && firstAlphaIndex !== -1) {
            revealedSet.add(firstAlphaIndex);
        }

        return chars.map((char, index) => {
            if (revealedSet.has(index)) return char;
            if (/[a-zA-Z0-9]/.test(char)) return '_';
            return char;
        }).join(' ');
    }

    // ════════════════════════════════════════════════════════
    //  JEUX-VIDÉO GUESS GAME
    // ════════════════════════════════════════════════════════

    /**
     * Fetches the daily target video game (platform/year/genres/editeur/studio).
     */
    async getDailyTargetJeux(forGameNumber?: number) {
        const gameNumber = forGameNumber ?? this.getGameNumber();

        const candidates = await this.prisma.akJeuxVideo.findMany({
            where: {
                statut: 1,
                annee: { gt: 0 },
                editeur: { not: null },
            },
            select: { idJeu: true },
            orderBy: { idJeu: 'asc' },
        });

        if (candidates.length === 0) {
            throw new NotFoundException('Aucun jeu candidat trouvé pour le jeu');
        }

        const index = gameNumber % candidates.length;
        const targetId = candidates[index].idJeu;

        return this.getJeuForGuess(targetId);
    }

    /**
     * Fetches a video game with all fields needed for comparison.
     */
    private async getJeuForGuess(id: number) {
        const item = await this.prisma.akJeuxVideo.findUnique({
            where: { idJeu: id, statut: 1 },
            select: {
                idJeu: true,
                titre: true,
                image: true,
                niceUrl: true,
                annee: true,
                editeur: true,
                developpeur: true,
                platforms: {
                    select: {
                        platform: { select: { name: true, shortName: true } }
                    },
                    orderBy: { isPrimary: 'desc' },
                },
                genres: {
                    select: {
                        genre: { select: { nameFr: true, name: true } }
                    }
                },
            },
        });

        if (!item) throw new NotFoundException('Jeu vidéo introuvable');
        return item;
    }

    /**
     * Compares a guessed video game against the daily target.
     */
    async compareGuessJeux(jeuId: number, userId?: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const target = await this.getDailyTargetJeux(gn);
        const guess = await this.getJeuForGuess(jeuId);

        const guessPlatforms = (guess.platforms || []).map(p => p.platform?.shortName || p.platform?.name).filter(Boolean);
        const targetPlatforms = (target.platforms || []).map(p => p.platform?.shortName || p.platform?.name).filter(Boolean);

        const guessGenres = (guess.genres || []).map(g => g.genre?.nameFr || g.genre?.name).filter(Boolean);
        const targetGenres = (target.genres || []).map(g => g.genre?.nameFr || g.genre?.name).filter(Boolean);

        const result = {
            jeu: {
                id: guess.idJeu,
                titre: guess.titre,
                image: guess.image,
                niceUrl: guess.niceUrl ?? null,
            },
            comparison: {
                platform: this.compareStringArrays(guessPlatforms, targetPlatforms),
                year: this.compareYear(guess.annee, target.annee),
                genres: this.compareStringArrays(guessGenres, targetGenres),
                editeur: this.compareValue(guess.editeur, target.editeur),
                developpeur: this.compareValue(guess.developpeur, target.developpeur),
            },
            isCorrect: guess.idJeu === target.idJeu,
        };

        if (userId) {
            const existing = await this.getUserScoreJeux(userId, gn);
            const guesses = existing ? [...(existing.guesses as any[]), result] : [result];
            await this.saveScoreJeux(userId, gn, guesses, result.isCorrect);
            const streak = await this.getUserStreakJeux(userId);
            return { ...result, streak };
        }

        return result;
    }

    async saveScoreJeux(userId: number, gameNumber: number, guesses: any[], isWon: boolean) {
        return this.prisma.akGuessGameScoreJeux.upsert({
            where: { userId_gameNumber: { userId, gameNumber } },
            update: { attempts: guesses.length, isWon, guesses },
            create: { userId, gameNumber, attempts: guesses.length, isWon, guesses },
        });
    }

    async getUserScoreJeux(userId: number, gameNumber: number) {
        return this.prisma.akGuessGameScoreJeux.findUnique({
            where: { userId_gameNumber: { userId, gameNumber } },
        });
    }

    async getUserStreakJeux(userId: number): Promise<number> {
        const scores = await this.prisma.akGuessGameScoreJeux.findMany({
            where: { userId },
            orderBy: { gameNumber: 'desc' },
            select: { gameNumber: true, isWon: true, attempts: true },
        });

        if (scores.length === 0) return 0;

        const currentGame = this.getGameNumber();
        let streak = 0;
        let expectedGame = currentGame;

        for (const score of scores) {
            if (score.gameNumber > currentGame) continue;
            if (score.gameNumber === currentGame && !score.isWon && score.attempts < 10) {
                expectedGame = currentGame - 1;
                continue;
            }
            if (score.gameNumber !== expectedGame) break;
            if (!score.isWon) { streak = 0; break; }
            streak++;
            expectedGame--;
        }

        return streak;
    }

    async getFullGameStateJeux(userId: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const [score, streak] = await Promise.all([
            this.getUserScoreJeux(userId, gn),
            this.getUserStreakJeux(userId),
        ]);
        return { ...score, streak };
    }

    async getHintJeux(attempts: number, forGameNumber?: number) {
        const target = await this.getDailyTargetJeux(forGameNumber);
        const hints: any = {};

        if (attempts >= 3) {
            hints.firstLetter = target.titre?.charAt(0) || '';
        }
        if (attempts >= 4) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 1, forGameNumber);
        }
        if (attempts >= 6) {
            hints.platforms = (target.platforms || []).map(p => p.platform?.shortName || p.platform?.name).filter(Boolean);
        }
        if (attempts >= 8) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 2, forGameNumber);
        }
        if (attempts >= 9) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 3, forGameNumber);
        }
        if (attempts >= 10) {
            hints.answer = target.titre;
        }

        return hints;
    }

    private compareStringArrays(guess: string[], target: string[]) {
        const common = guess.filter(v => target.includes(v));
        if (common.length === target.length && guess.length === target.length) {
            return { status: 'correct', common };
        }
        if (common.length > 0) {
            return { status: 'partial', common };
        }
        return { status: 'incorrect', common: [] };
    }

    // ════════════════════════════════════════════════════════
    //  SCREENSHOT GUESS GAME
    // ════════════════════════════════════════════════════════

    /**
     * Fetches today's screenshot target — a random anime screenshot (type=1),
     * deterministically selected from popular published animes.
     */
    async getDailyTargetScreenshot(forGameNumber?: number) {
        const gameNumber = forGameNumber ?? this.getGameNumber();

        // Step 1: Get distinct anime IDs that have at least one type=1 screenshot,
        // filtered to popular published animes only.
        // We query from the screenshot table to get the intersection, then sort by
        // idTitre for a stable deterministic list.
        const popularAnimeIds = await this.prisma.akAnime.findMany({
            where: {
                statut: 1,
                classementPopularite: { gt: 0, lte: 2000 },
            },
            select: { idAnime: true },
            orderBy: { idAnime: 'asc' },
        }).then(rows => rows.map(r => r.idAnime));

        // Distinct anime IDs that actually have screenshots
        const animeIdsWithScreenshots = await this.prisma.akScreenshot.findMany({
            where: {
                type: 1,
                idTitre: { in: popularAnimeIds, gt: 0 },
                urlScreen: { not: null },
            },
            select: { idTitre: true },
            distinct: ['idTitre'],
            orderBy: { idTitre: 'asc' },
        }).then(rows => rows.map(r => r.idTitre));

        if (animeIdsWithScreenshots.length === 0) {
            throw new NotFoundException('Aucun screenshot candidat trouvé pour le jeu');
        }

        // Step 2: Pick anime deterministically by gameNumber
        const animeIndex = gameNumber % animeIdsWithScreenshots.length;
        const targetAnimeId = animeIdsWithScreenshots[animeIndex];

        const anime = await this.prisma.akAnime.findUnique({
            where: { idAnime: targetAnimeId },
            select: {
                idAnime: true,
                titre: true,
                image: true,
                niceUrl: true,
                annee: true,
                format: true,
                studio: true,
            },
        });

        if (!anime) throw new NotFoundException('Anime cible introuvable');

        // Step 3: Get all type=1 screenshots for that specific anime
        const screenshots = await this.prisma.akScreenshot.findMany({
            where: { type: 1, idTitre: targetAnimeId, urlScreen: { not: null } },
            select: { idScreen: true, urlScreen: true },
            orderBy: { idScreen: 'asc' },
        });

        if (screenshots.length === 0) throw new NotFoundException('Aucun screenshot pour cet anime');

        // Step 4: Pick screenshot deterministically (cycle through them across days)
        const screenshotIndex = Math.floor(gameNumber / animeIdsWithScreenshots.length) % screenshots.length;
        const targetScreenshot = screenshots[screenshotIndex];

        return {
            anime,
            screenshot: { idScreen: targetScreenshot.idScreen, urlScreen: targetScreenshot.urlScreen! },
        };
    }

    /**
     * Compares a guessed anime against the daily screenshot target.
     */
    async compareGuessScreenshot(animeId: number, userId?: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const { anime: target, screenshot } = await this.getDailyTargetScreenshot(gn);
        const guess = await this.prisma.akAnime.findUnique({
            where: { idAnime: animeId, statut: 1 },
            select: { idAnime: true, titre: true, image: true, niceUrl: true, format: true },
        });

        if (!guess) throw new NotFoundException('Anime deviné introuvable');

        const isCorrect = guess.idAnime === target.idAnime ||
            await this.areRelatedAnimes(guess.idAnime, target.idAnime, guess.format, target.format);

        const result: any = {
            anime: {
                id: guess.idAnime,
                titre: guess.titre,
                image: guess.image,
                niceUrl: guess.niceUrl ?? null,
            },
            isCorrect,
        };

        const buildRevealedAnime = () => ({
            id: target.idAnime,
            titre: target.titre,
            image: target.image,
            niceUrl: target.niceUrl ?? null,
        });

        if (userId) {
            const existing = await this.getUserScoreScreenshot(userId, gn);
            const guesses = existing ? [...(existing.guesses as any[]), result] : [result];
            await this.saveScoreScreenshot(userId, gn, guesses, result.isCorrect);
            const streak = await this.getUserStreakScreenshot(userId);
            const gameOver = guesses.length >= 6;
            const revealedAnime = (gameOver && !result.isCorrect) ? buildRevealedAnime() : undefined;
            return { ...result, streak, gameOver, ...(revealedAnime && { revealedAnime }) };
        }

        return result;
    }

    async saveScoreScreenshot(userId: number, gameNumber: number, guesses: any[], isWon: boolean) {
        return this.prisma.akGuessGameScoreScreenshot.upsert({
            where: { userId_gameNumber: { userId, gameNumber } },
            update: { attempts: guesses.length, isWon, guesses },
            create: { userId, gameNumber, attempts: guesses.length, isWon, guesses },
        });
    }

    async getUserScoreScreenshot(userId: number, gameNumber: number) {
        return this.prisma.akGuessGameScoreScreenshot.findUnique({
            where: { userId_gameNumber: { userId, gameNumber } },
        });
    }

    async getUserStreakScreenshot(userId: number): Promise<number> {
        const scores = await this.prisma.akGuessGameScoreScreenshot.findMany({
            where: { userId },
            orderBy: { gameNumber: 'desc' },
            select: { gameNumber: true, isWon: true, attempts: true },
        });

        if (scores.length === 0) return 0;

        const currentGame = this.getGameNumber();
        let streak = 0;
        let expectedGame = currentGame;

        for (const score of scores) {
            if (score.gameNumber > currentGame) continue;
            if (score.gameNumber === currentGame && !score.isWon && score.attempts < 6) {
                expectedGame = currentGame - 1;
                continue;
            }
            if (score.gameNumber !== expectedGame) break;
            if (!score.isWon) { streak = 0; break; }
            streak++;
            expectedGame--;
        }

        return streak;
    }

    async getFullGameStateScreenshot(userId: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const [score, streak] = await Promise.all([
            this.getUserScoreScreenshot(userId, gn),
            this.getUserStreakScreenshot(userId),
        ]);
        const gameFailed = score && !score.isWon && score.attempts >= 6;
        if (gameFailed) {
            const { anime: target } = await this.getDailyTargetScreenshot(gn);
            const revealedAnime = {
                id: target.idAnime,
                titre: target.titre,
                image: target.image,
                niceUrl: target.niceUrl ?? null,
            };
            return { ...score, streak, revealedAnime };
        }
        return { ...score, streak };
    }

    /**
     * Returns text hints based on attempt count.
     * attempts >= 4 → year
     * attempts >= 5 → year + format + studio
     */
    async getHintScreenshot(attempts: number, forGameNumber?: number) {
        const { anime } = await this.getDailyTargetScreenshot(forGameNumber);
        const hints: any = {};

        if (attempts >= 4) {
            hints.year = anime.annee ?? null;
        }

        if (attempts >= 5) {
            hints.year = anime.annee ?? null;
            hints.format = anime.format ?? null;
            hints.studio = anime.studio ?? null;
        }

        return hints;
    }

    // ════════════════════════════════════════════════════════
    //  MANGA GUESS GAME
    // ════════════════════════════════════════════════════════

    async getDailyTargetManga(forGameNumber?: number) {
        const gameNumber = forGameNumber ?? this.getGameNumber();

        const candidates = await this.prisma.akManga.findMany({
            where: {
                statut: 1,
                classementPopularite: { gt: 0, lte: 2000 },
            },
            select: { idManga: true },
            orderBy: { idManga: 'asc' },
        });

        if (candidates.length === 0) throw new NotFoundException('Aucun manga candidat trouvé pour le jeu');

        const index = gameNumber % candidates.length;
        const targetId = candidates[index].idManga;

        return this.prisma.akManga.findUnique({
            where: { idManga: targetId },
            select: { idManga: true, titre: true, annee: true, origine: true, editeur: true, nbVol: true, tags: true, image: true, niceUrl: true },
        });
    }

    private parseMangaTags(tags: string | null): string[] {
        if (!tags) return [];
        return tags.split(/[,\n]/).map(t => t.trim()).filter(Boolean);
    }

    async compareGuessManga(mangaId: number, userId?: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const target = await this.getDailyTargetManga(gn);
        const guess = await this.prisma.akManga.findUnique({
            where: { idManga: mangaId, statut: 1 },
            select: { idManga: true, titre: true, annee: true, origine: true, editeur: true, nbVol: true, tags: true, image: true, niceUrl: true },
        });

        if (!guess) throw new NotFoundException('Manga deviné introuvable');

        const isCorrect = guess.idManga === target.idManga;
        const guessTagsArr = this.parseMangaTags(guess.tags);
        const targetTagsArr = this.parseMangaTags(target.tags);

        const result = {
            manga: {
                id: guess.idManga,
                titre: guess.titre,
                image: guess.image,
                niceUrl: guess.niceUrl ?? null,
            },
            comparison: {
                year: this.compareYear(Number(guess.annee), Number(target.annee)),
                format: this.compareValue(guess.origine, target.origine),
                editeur: this.compareValue(guess.editeur, target.editeur),
                volumes: this.compareEpisodes(guess.nbVol ?? 0, target.nbVol ?? 0),
                tags: { status: this.compareMangaTagsStatus(guessTagsArr, targetTagsArr), common: guessTagsArr.filter(t => targetTagsArr.includes(t)) },
            },
            isCorrect,
        };

        if (userId) {
            const existing = await this.getUserScoreManga(userId, gn);
            const guesses = existing ? [...(existing.guesses as any[]), result] : [result];
            await this.saveScoreManga(userId, gn, guesses, result.isCorrect);
            const streak = await this.getUserStreakManga(userId);
            return { ...result, streak };
        }

        return result;
    }

    private compareMangaTagsStatus(guessTags: string[], targetTags: string[]): 'correct' | 'partial' | 'incorrect' {
        const common = guessTags.filter(t => targetTags.includes(t));
        if (common.length === targetTags.length && guessTags.length === targetTags.length) return 'correct';
        if (common.length > 0) return 'partial';
        return 'incorrect';
    }

    async saveScoreManga(userId: number, gameNumber: number, guesses: any[], isWon: boolean) {
        return this.prisma.akGuessGameScoreManga.upsert({
            where: { userId_gameNumber: { userId, gameNumber } },
            update: { attempts: guesses.length, isWon, guesses },
            create: { userId, gameNumber, attempts: guesses.length, isWon, guesses },
        });
    }

    async getUserScoreManga(userId: number, gameNumber: number) {
        return this.prisma.akGuessGameScoreManga.findUnique({
            where: { userId_gameNumber: { userId, gameNumber } },
        });
    }

    async getUserStreakManga(userId: number): Promise<number> {
        const scores = await this.prisma.akGuessGameScoreManga.findMany({
            where: { userId },
            orderBy: { gameNumber: 'desc' },
            select: { gameNumber: true, isWon: true, attempts: true },
        });

        if (scores.length === 0) return 0;

        const currentGame = this.getGameNumber();
        let streak = 0;
        let expectedGame = currentGame;

        for (const score of scores) {
            if (score.gameNumber > currentGame) continue;
            if (score.gameNumber === currentGame && !score.isWon && score.attempts < 10) {
                expectedGame = currentGame - 1;
                continue;
            }
            if (score.gameNumber !== expectedGame) break;
            if (!score.isWon) { streak = 0; break; }
            streak++;
            expectedGame--;
        }

        return streak;
    }

    async getFullGameStateManga(userId: number, forGameNumber?: number) {
        const gn = forGameNumber ?? this.getGameNumber();
        const [score, streak] = await Promise.all([
            this.getUserScoreManga(userId, gn),
            this.getUserStreakManga(userId),
        ]);
        return { ...score, streak };
    }

    async getHintManga(attempts: number, forGameNumber?: number) {
        const target = await this.getDailyTargetManga(forGameNumber);
        const hints: any = {};

        if (attempts >= 3) hints.maskedTitle = this.generateMaskedTitle(target.titre, 0, forGameNumber);
        if (attempts >= 4) hints.maskedTitle = this.generateMaskedTitle(target.titre, 1, forGameNumber, { excludeFirstLetter: true });
        if (attempts >= 5) hints.maskedTitle = this.generateMaskedTitle(target.titre, 2, forGameNumber, { excludeFirstLetter: true });
        if (attempts >= 6) hints.tags = this.parseMangaTags(target.tags);
        if (attempts >= 7) hints.maskedTitle = this.generateMaskedTitle(target.titre, 2, forGameNumber, { excludeFirstLetter: true, alwaysRevealFirstLetter: true });
        if (attempts >= 8) hints.maskedTitle = this.generateMaskedTitle(target.titre, 3, forGameNumber, { excludeFirstLetter: true, alwaysRevealFirstLetter: true });
        if (attempts >= 9) hints.maskedTitle = this.generateMaskedTitle(target.titre, 4, forGameNumber, { excludeFirstLetter: true, alwaysRevealFirstLetter: true });
        if (attempts >= 10) hints.answer = target.titre;

        return hints;
    }
}
