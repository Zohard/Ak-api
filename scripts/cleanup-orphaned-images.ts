/**
 * Script to find and optionally delete orphaned ImageKit images
 * (Images in ImageKit but not referenced in database)
 *
 * Usage:
 *   npm run cleanup-images -- --dry-run    (list orphaned images)
 *   npm run cleanup-images                  (delete orphaned images)
 */

import ImageKit from 'imagekit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || '',
});

async function findOrphanedImages(dryRun = true) {
  console.log('🔍 Scanning for orphaned images...\n');

  const folders = ['images/animes', 'images/mangas', 'images/games'];
  let totalOrphaned = 0;
  let totalDeleted = 0;

  for (const folder of folders) {
    console.log(`\n📁 Checking folder: ${folder}`);

    try {
      const files = await imagekit.listFiles({
        path: folder,
        limit: 1000,
      });

      console.log(`  Found ${files.length} files`);

      for (const file of files) {
        // Skip folders - only process files
        if (file.type !== 'file') {
          continue;
        }

        const filename = file.name;

        // Check if filename exists in ak_screenshots table
        const existsInDb = await prisma.$queryRaw`
          SELECT COUNT(*) as count
          FROM ak_screenshots
          WHERE url_screen = ${filename}
             OR url_screen = ${`screenshots/${filename}`}
        `;

        const count = Number((existsInDb as any)[0]?.count || 0);

        if (count === 0) {
          totalOrphaned++;
          console.log(`  ❌ Orphaned: ${filename} (ID: ${file.fileId})`);

          if (!dryRun) {
            try {
              await imagekit.deleteFile(file.fileId);
              totalDeleted++;
              console.log(`     ✅ Deleted`);
            } catch (err) {
              console.error(`     ⚠️  Failed to delete: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`  ⚠️  Error scanning folder: ${err.message}`);
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   Total orphaned files: ${totalOrphaned}`);

  if (dryRun) {
    console.log(`\n💡 This was a dry run. To delete these files, run:`);
    console.log(`   npm run cleanup-images`);
  } else {
    console.log(`   Total deleted: ${totalDeleted}`);
  }
}

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');

findOrphanedImages(isDryRun)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
