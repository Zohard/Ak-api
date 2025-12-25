const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const entry1256 = await prisma.collectionJeuxVideo.findUnique({
    where: { idCollection: 1256 },
    include: {
      user: {
        select: {
          idMember: true,
          memberName: true
        }
      },
      jeuxVideo: {
        select: {
          idJeu: true,
          titre: true
        }
      }
    }
  });

  const entry8553 = await prisma.collectionJeuxVideo.findUnique({
    where: { idCollection: 8553 },
    include: {
      user: {
        select: {
          idMember: true,
          memberName: true
        }
      },
      jeuxVideo: {
        select: {
          idJeu: true,
          titre: true
        }
      }
    }
  });

  console.log('Entry 1256 (FAILING):');
  console.log(JSON.stringify(entry1256, null, 2));
  console.log('\nEntry 8553 (WORKING):');
  console.log(JSON.stringify(entry8553, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
