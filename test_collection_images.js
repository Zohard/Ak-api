const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testCollectionImages() {
  // Get a user with collections
  const userId = 17667; // Replace with actual user ID
  
  // Test anime collection
  const animeItem = await prisma.collectionAnime.findFirst({
    where: {
      idMembre: userId,
      type: 1, // Completed
      anime: {
        image: {
          not: null
        }
      }
    },
    include: { anime: { select: { image: true, titre: true } } },
    orderBy: { idCollection: 'desc' }
  });

  console.log('Anime item:', animeItem);

  // Test manga collection
  const mangaItem = await prisma.collectionManga.findFirst({
    where: {
      idMembre: userId,
      type: 1,
      manga: {
        image: {
          not: null
        }
      }
    },
    include: { manga: { select: { image: true, titre: true } } },
    orderBy: { idCollection: 'desc' }
  });

  console.log('Manga item:', mangaItem);
  
  await prisma.$disconnect();
}

testCollectionImages();
