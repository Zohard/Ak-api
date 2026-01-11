import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AnimeScore {
  id_anime: number;
  score: number;
}

interface AnimeRanking {
  id_anime: number;
  score: number;
  rank: number;
  previousRank: number;
}

/**
 * Calculate popularity score for an anime
 * Formula: (usersInCollection * 10) + (avgReviewScore * 5) + (views / 100) + (collectionScore * 2)
 */
async function calculatePopularityScores(): Promise<AnimeScore[]> {
  console.log('📊 Calculating anime popularity scores...');

  const scores = await prisma.$queryRaw<AnimeScore[]>`
    WITH anime_stats AS (
      SELECT
        a.id_anime,
        -- Number of unique users who have this anime in their collection
        (SELECT COUNT(DISTINCT id_membre) FROM collection_animes WHERE id_anime = a.id_anime) as users_in_collection,
        -- Average review score from ak_animes
        COALESCE(a.moyennenotes, 0) as avg_review_score,
        -- Total views
        COALESCE(a.nb_clics, 0) as views,
        -- Average collection score from user evaluations
        COALESCE((
          SELECT AVG(evaluation)
          FROM collection_animes
          WHERE id_anime = a.id_anime AND evaluation > 0.0
        ), 0) as collection_score
      FROM ak_animes a
      WHERE a.statut = 1
    )
    SELECT
      id_anime,
      (
        (users_in_collection * 10) +
        (avg_review_score * 5) +
        (views / 100.0) +
        (collection_score * 2)
      ) as score
    FROM anime_stats
    ORDER BY score DESC
  `;

  console.log(`✅ Calculated scores for ${scores.length} animes`);
  return scores;
}

/**
 * Assign ranks to animes based on their scores and track changes
 */
async function assignRanks(scores: AnimeScore[]): Promise<AnimeRanking[]> {
  console.log('🏆 Assigning ranks...');

  // Get current ranks from database
  const currentRanks = await prisma.akAnime.findMany({
    where: {
      statut: 1,
      classementPopularite: { not: 0 },
    },
    select: {
      idAnime: true,
      classementPopularite: true,
    },
  });

  const currentRankMap = new Map(
    currentRanks.map((a) => [a.idAnime, a.classementPopularite]),
  );

  // Assign new ranks
  const rankings: AnimeRanking[] = scores.map((anime, index) => ({
    id_anime: anime.id_anime,
    score: anime.score,
    rank: index + 1,
    previousRank: currentRankMap.get(anime.id_anime) || 0,
  }));

  console.log(`✅ Assigned ranks to ${rankings.length} animes`);
  return rankings;
}

/**
 * Calculate variation text (e.g., "+5", "-3", "NEW", "=")
 */
function calculateVariation(rank: number, previousRank: number): string {
  if (previousRank === 0) {
    return 'NEW';
  }
  const change = previousRank - rank;
  if (change > 0) {
    return `+${change}`;
  } else if (change < 0) {
    return `${change}`;
  }
  return '=';
}

/**
 * Update database with new rankings
 */
async function updateDatabase(rankings: AnimeRanking[]): Promise<void> {
  console.log('💾 Updating database...');

  let updatedCount = 0;
  let errorCount = 0;

  // Update in batches to avoid overwhelming the database
  const batchSize = 100;
  for (let i = 0; i < rankings.length; i += batchSize) {
    const batch = rankings.slice(i, i + batchSize);

    const promises = batch.map(async (anime) => {
      try {
        const variation = calculateVariation(anime.rank, anime.previousRank);

        await prisma.akAnime.update({
          where: { idAnime: anime.id_anime },
          data: {
            classementPopularite: anime.rank,
            variationPopularite: variation,
          },
        });

        updatedCount++;
      } catch (error) {
        console.error(
          `❌ Error updating anime ${anime.id_anime}:`,
          error.message,
        );
        errorCount++;
      }
    });

    await Promise.all(promises);

    // Log progress
    const progress = Math.min(i + batchSize, rankings.length);
    console.log(`   Progress: ${progress}/${rankings.length} animes updated`);
  }

  console.log(`✅ Updated ${updatedCount} animes`);
  if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} errors occurred`);
  }
}

/**
 * Display top 10 animes
 */
async function displayTop10(rankings: AnimeRanking[]): Promise<void> {
  console.log('\n🏆 Top 10 Most Popular Animes:');
  console.log('━'.repeat(80));

  for (let i = 0; i < Math.min(10, rankings.length); i++) {
    const ranking = rankings[i];

    // Fetch anime details
    const anime = await prisma.akAnime.findUnique({
      where: { idAnime: ranking.id_anime },
      select: {
        titre: true,
        annee: true,
      },
    });

    const variation =
      ranking.previousRank === 0
        ? '🆕'
        : ranking.previousRank > ranking.rank
          ? `📈 +${ranking.previousRank - ranking.rank}`
          : ranking.previousRank < ranking.rank
            ? `📉 ${ranking.previousRank - ranking.rank}`
            : '━';

    console.log(
      `${(i + 1).toString().padStart(2)}. ${anime?.titre || 'Unknown'} (${anime?.annee || 'N/A'})`,
    );
    console.log(
      `    Score: ${ranking.score.toFixed(2)} | Change: ${variation}`,
    );
  }

  console.log('━'.repeat(80));
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  console.log('🚀 Starting anime popularity update...');
  console.log(`📅 Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Calculate scores
    const scores = await calculatePopularityScores();

    if (scores.length === 0) {
      console.log('⚠️  No animes found to rank');
      return;
    }

    // Step 2: Assign ranks
    const rankings = await assignRanks(scores);

    // Step 3: Update database
    await updateDatabase(rankings);

    // Step 4: Display top 10
    await displayTop10(rankings);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Popularity update completed in ${duration}s`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
