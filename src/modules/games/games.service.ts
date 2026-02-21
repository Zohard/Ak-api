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
        const epoch = new Date('2024-01-01').getTime();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.floor((today.getTime() - epoch) / (24 * 60 * 60 * 1000));
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
    async compareGuess(animeId: number, userId?: number) {
        const target = await this.getDailyTarget();
        const guess = await this.animesService.findOne(animeId);

        if (!guess) {
            throw new NotFoundException('Anime deviné introuvable');
        }

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
            isCorrect: guess.id === target.id,
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

        if (attempts >= 5) {
            hints.tags = (target.tags || []).map(t => t.tag_name).filter(Boolean);
        }

        if (attempts >= 8) {
            hints.maskedTitle = this.generateMaskedTitle(target.titre, true);
        }

        if (attempts >= 10) {
            hints.answer = target.titre;
        }

        return hints;
    }

    private generateMaskedTitle(title: string, revealRandomLetter: boolean): string {
        if (!title) return '';

        const chars = title.split('');
        const firstLetter = chars[0];

        // Define indices that can be revealed (alphanumeric, not space, not the first letter)
        const revealableIndices = [];
        for (let i = 1; i < chars.length; i++) {
            if (/[a-zA-Z0-9]/.test(chars[i])) {
                revealableIndices.push(i);
            }
        }

        let randomRevealIndex = -1;
        if (revealRandomLetter && revealableIndices.length > 0) {
            // Use date-based seed for stability if possible, but for a "hint" random is often fine.
            // However, to keep it consistent for the user during the same day, we could seed it.
            const seed = this.getGameNumber() + title.length;
            const pseudoRandom = (Math.sin(seed) + 1) / 2;
            randomRevealIndex = revealableIndices[Math.floor(pseudoRandom * revealableIndices.length)];
        }

        return chars.map((char, index) => {
            if (index === 0) return char;
            if (index === randomRevealIndex) return char;
            if (/[a-zA-Z0-9]/.test(char)) return '_';
            return char; // Keep spaces, dashes, etc.
        }).join(' ');
    }
}
