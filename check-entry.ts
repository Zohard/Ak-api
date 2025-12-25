import { PrismaClient } from '@prisma/client';

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
  console.log('  Collection ID:', entry1256?.idCollection);
  console.log('  id_membre:', entry1256?.idMembre, 'type:', typeof entry1256?.idMembre);
  console.log('  Owner:', entry1256?.user?.memberName, '(ID:', entry1256?.user?.idMember, ')');
  console.log('  Game:', entry1256?.jeuxVideo?.titre);
  console.log('  Type:', entry1256?.type);

  console.log('\nEntry 8553 (WORKING):');
  console.log('  Collection ID:', entry8553?.idCollection);
  console.log('  id_membre:', entry8553?.idMembre, 'type:', typeof entry8553?.idMembre);
  console.log('  Owner:', entry8553?.user?.memberName, '(ID:', entry8553?.user?.idMember, ')');
  console.log('  Game:', entry8553?.jeuxVideo?.titre);
  console.log('  Type:', entry8553?.type);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
