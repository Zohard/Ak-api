import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to replace literal \n strings with actual newline characters
 * in alternative titles for anime, manga, and games
 */
async function fixAlternativeTitlesNewlines() {
  console.log('🔧 Starting to fix alternative titles newlines...\n');

  try {
    // Fix Anime alternative titles
    console.log('📺 Processing anime...');
    const animes = await prisma.akAnime.findMany({
      where: {
        titresAlternatifs: {
          contains: '\\n', // Matches literal \n in the database
        },
      },
      select: {
        idAnime: true,
        titre: true,
        titresAlternatifs: true,
      },
    });

    console.log(`Found ${animes.length} anime with \\n in alternative titles`);

    let animeUpdated = 0;
    for (const anime of animes) {
      if (anime.titresAlternatifs) {
        const fixed = anime.titresAlternatifs.replace(/\\n/g, '\n');

        await prisma.akAnime.update({
          where: { idAnime: anime.idAnime },
          data: { titresAlternatifs: fixed },
        });

        console.log(`  ✓ Fixed anime ${anime.idAnime}: ${anime.titre}`);
        animeUpdated++;
      }
    }

    // Fix Manga alternative titles
    console.log('\n📚 Processing manga...');
    const mangas = await prisma.akManga.findMany({
      where: {
        titresAlternatifs: {
          contains: '\\n',
        },
      },
      select: {
        idManga: true,
        titre: true,
        titresAlternatifs: true,
      },
    });

    console.log(`Found ${mangas.length} manga with \\n in alternative titles`);

    let mangaUpdated = 0;
    for (const manga of mangas) {
      if (manga.titresAlternatifs) {
        const fixed = manga.titresAlternatifs.replace(/\\n/g, '\n');

        await prisma.akManga.update({
          where: { idManga: manga.idManga },
          data: { titresAlternatifs: fixed },
        });

        console.log(`  ✓ Fixed manga ${manga.idManga}: ${manga.titre}`);
        mangaUpdated++;
      }
    }

    // Check if games table has titresAlternatifs field
    console.log('\n🎮 Checking games...');
    try {
      const games = await prisma.akJeuxVideo.findMany({
        where: {
          titresAlternatifs: {
            contains: '\\n',
          },
        },
        select: {
          idJeu: true,
          titre: true,
          titresAlternatifs: true,
        },
      });

      console.log(`Found ${games.length} games with \\n in alternative titles`);

      let gamesUpdated = 0;
      for (const game of games) {
        if (game.titresAlternatifs) {
          const fixed = game.titresAlternatifs.replace(/\\n/g, '\n');

          await prisma.akJeuxVideo.update({
            where: { idJeu: game.idJeu },
            data: { titresAlternatifs: fixed },
          });

          console.log(`  ✓ Fixed game ${game.idJeu}: ${game.titre}`);
          gamesUpdated++;
        }
      }

      console.log('\n✨ Summary:');
      console.log(`  - Anime updated: ${animeUpdated}/${animes.length}`);
      console.log(`  - Manga updated: ${mangaUpdated}/${mangas.length}`);
      console.log(`  - Games updated: ${gamesUpdated}/${games.length}`);
      console.log(`  - Total: ${animeUpdated + mangaUpdated + gamesUpdated}`);
    } catch (error) {
      // Games table might not have titresAlternatifs field
      console.log('  ⚠️  Games table does not have titresAlternatifs field or error occurred');

      console.log('\n✨ Summary:');
      console.log(`  - Anime updated: ${animeUpdated}/${animes.length}`);
      console.log(`  - Manga updated: ${mangaUpdated}/${mangas.length}`);
      console.log(`  - Total: ${animeUpdated + mangaUpdated}`);
    }

    console.log('\n✅ All done!');
  } catch (error) {
    console.error('\n❌ Error occurred:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixAlternativeTitlesNewlines()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
