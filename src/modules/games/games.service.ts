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
    async getDailyTarget() {
        const gameNumber = this.getGameNumber();

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

    async compareGuess(animeId: number, userId?: number) {
        const target = await this.getDailyTarget();
        const guess = await this.animesService.findOne(animeId);

        if (!guess) {
            throw new NotFoundException('Anime deviné introuvable');
        }

        const isCorrect = guess.id === target.id ||
            await this.areRelatedAnimes(guess.id, target.id, guess.format, target.format);

        const result = {
            anime: {
                id: guess.id,
                titre: guess.titre,
                image: guess.image,
                niceUrl: (guess as any).niceUrl ?? null,
            },
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
            const gameNumber = this.getGameNumber();
            const existing = await this.getUserScore(userId, gameNumber);

            const guesses = existing ? [...(existing.guesses as any[]), result] : [result];
            await this.saveScore(userId, gameNumber, guesses, result.isCorrect);

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
    async resolveAttempts(clientAttempts: number, userId: number | undefined, game: 'anime' | 'jeux'): Promise<number> {
        if (userId) {
            const gameNumber = this.getGameNumber();
            const score = game === 'anime'
                ? await this.getUserScore(userId, gameNumber)
                : await this.getUserScoreJeux(userId, gameNumber);
            return score?.attempts ?? 0;
        }
        return Math.min(Number(clientAttempts) || 0, 9);
    }

    /**
     * Returns today's game score enriched with the user's current streak.
     */
    async getFullGameState(userId: number) {
        const gameNumber = this.getGameNumber();
        const [score, streak] = await Promise.all([
            this.getUserScore(userId, gameNumber),
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
    async getHint(attempts: number) {
        const target = await this.getDailyTarget();
        const hints: any = {};

        if (attempts >= 3) {
            hints.firstLetter = target.titre?.charAt(0) || '';
        }

        if (attempts >= 4) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 1);
        }

        if (attempts >= 6) {
            hints.tags = (target.tags || []).map(t => t.tag_name).filter(Boolean);
        }

        if (attempts >= 8) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 2);
        }

        if (attempts >= 9) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 3);
        }

        if (attempts >= 10) {
            hints.answer = target.titre;
        }

        return hints;
    }

    private generateMaskedTitle(title: string, revealCount: number): string {
        if (!title) return '';

        const chars = title.split('');

        // Collect indices that can be revealed (alphanumeric, not the first letter)
        const revealableIndices: number[] = [];
        for (let i = 1; i < chars.length; i++) {
            if (/[a-zA-Z0-9]/.test(chars[i])) {
                revealableIndices.push(i);
            }
        }

        // Pick indices deterministically using a seeded shuffle so hints are
        // consistent for the same game number across users and page reloads.
        const seed = this.getGameNumber() + title.length;
        const shuffled = [...revealableIndices].sort((a, b) => {
            const ra = (Math.sin(seed * a + 1) + 1) / 2;
            const rb = (Math.sin(seed * b + 1) + 1) / 2;
            return ra - rb;
        });
        const revealedSet = new Set(shuffled.slice(0, revealCount));

        return chars.map((char, index) => {
            if (index === 0) return char;
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
    async getDailyTargetJeux() {
        const gameNumber = this.getGameNumber();

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
    async compareGuessJeux(jeuId: number, userId?: number) {
        const target = await this.getDailyTargetJeux();
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
            const gameNumber = this.getGameNumber();
            const existing = await this.getUserScoreJeux(userId, gameNumber);
            const guesses = existing ? [...(existing.guesses as any[]), result] : [result];
            await this.saveScoreJeux(userId, gameNumber, guesses, result.isCorrect);
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

    async getFullGameStateJeux(userId: number) {
        const gameNumber = this.getGameNumber();
        const [score, streak] = await Promise.all([
            this.getUserScoreJeux(userId, gameNumber),
            this.getUserStreakJeux(userId),
        ]);
        return { ...score, streak };
    }

    async getHintJeux(attempts: number) {
        const target = await this.getDailyTargetJeux();
        const hints: any = {};

        if (attempts >= 3) {
            hints.firstLetter = target.titre?.charAt(0) || '';
        }
        if (attempts >= 4) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 1);
        }
        if (attempts >= 6) {
            hints.platforms = (target.platforms || []).map(p => p.platform?.shortName || p.platform?.name).filter(Boolean);
        }
        if (attempts >= 8) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 2);
        }
        if (attempts >= 9) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, 3);
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
}
