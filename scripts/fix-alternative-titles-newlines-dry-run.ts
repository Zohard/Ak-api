import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * DRY RUN: Shows what would be changed without actually changing it
 * Script to replace literal \n strings with actual newline characters
 * in alternative titles for anime, manga, and games
 */
async function dryRunFixAlternativeTitlesNewlines() {
  console.log('🔍 DRY RUN - Showing what would be changed (no actual changes will be made)\n');

  try {
    // Check Anime alternative titles
    console.log('📺 Checking anime...');
    const animes = await prisma.akAnime.findMany({
      where: {
        titresAlternatifs: {
          contains: '\\n',
        },
      },
      select: {
        idAnime: true,
        titre: true,
        titresAlternatifs: true,
      },
    });

    console.log(`Found ${animes.length} anime with \\n in alternative titles\n`);

    for (const anime of animes) {
      if (anime.titresAlternatifs) {
        console.log(`  📄 Anime ${anime.idAnime}: ${anime.titre}`);
        console.log(`     BEFORE: ${JSON.stringify(anime.titresAlternatifs)}`);
        const fixed = anime.titresAlternatifs.replace(/\\n/g, '\n');
        console.log(`     AFTER:  ${JSON.stringify(fixed)}`);
        console.log(`     DISPLAY BEFORE: ${anime.titresAlternatifs.split('\\n').join(' | ')}`);
        console.log(`     DISPLAY AFTER:  ${fixed.split('\n').join('\n                 ')}`);
        console.log('');
      }
    }

    // Check Manga alternative titles
    console.log('\n📚 Checking manga...');
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

    console.log(`Found ${mangas.length} manga with \\n in alternative titles\n`);

    for (const manga of mangas) {
      if (manga.titresAlternatifs) {
        console.log(`  📄 Manga ${manga.idManga}: ${manga.titre}`);
        console.log(`     BEFORE: ${JSON.stringify(manga.titresAlternatifs)}`);
        const fixed = manga.titresAlternatifs.replace(/\\n/g, '\n');
        console.log(`     AFTER:  ${JSON.stringify(fixed)}`);
        console.log(`     DISPLAY BEFORE: ${manga.titresAlternatifs.split('\\n').join(' | ')}`);
        console.log(`     DISPLAY AFTER:  ${fixed.split('\n').join('\n                 ')}`);
        console.log('');
      }
    }

    // Check Games
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

      console.log(`Found ${games.length} games with \\n in alternative titles\n`);

      for (const game of games) {
        if (game.titresAlternatifs) {
          console.log(`  📄 Game ${game.idJeu}: ${game.titre}`);
          console.log(`     BEFORE: ${JSON.stringify(game.titresAlternatifs)}`);
          const fixed = game.titresAlternatifs.replace(/\\n/g, '\n');
          console.log(`     AFTER:  ${JSON.stringify(fixed)}`);
          console.log(`     DISPLAY BEFORE: ${game.titresAlternatifs.split('\\n').join(' | ')}`);
          console.log(`     DISPLAY AFTER:  ${fixed.split('\n').join('\n                 ')}`);
          console.log('');
        }
      }

      console.log('\n📊 Summary (DRY RUN):');
      console.log(`  - Anime that would be updated: ${animes.length}`);
      console.log(`  - Manga that would be updated: ${mangas.length}`);
      console.log(`  - Games that would be updated: ${games.length}`);
      console.log(`  - Total: ${animes.length + mangas.length + games.length}`);
    } catch (error) {
      console.log('  ⚠️  Games table does not have titresAlternatifs field or error occurred');

      console.log('\n📊 Summary (DRY RUN):');
      console.log(`  - Anime that would be updated: ${animes.length}`);
      console.log(`  - Manga that would be updated: ${mangas.length}`);
      console.log(`  - Total: ${animes.length + mangas.length}`);
    }

    console.log('\n💡 To apply these changes, run: npm run fix-alt-titles');
  } catch (error) {
    console.error('\n❌ Error occurred:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the dry run
dryRunFixAlternativeTitlesNewlines()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
