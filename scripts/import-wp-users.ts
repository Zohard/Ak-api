import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
const csvParser = require('csv-parser');

const prisma = new PrismaClient();

interface WpUserCsvRow {
  ID: string;
  user_login: string;
  user_pass: string;
  user_nicename: string;
  user_email: string;
  user_url: string;
  user_registered: string;
  user_activation_key: string;
  user_status: string;
  display_name: string;
}

async function importWpUsers() {
  try {
    console.log('🚀 Starting WordPress users import...');

    // Path to CSV file
    const csvPath = path.join(__dirname, '../../frontendv2/wp_users.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const users: WpUserCsvRow[] = [];

    // Read and parse CSV
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csvParser())
        .on('data', (row: WpUserCsvRow) => {
          users.push(row);
        })
        .on('end', () => {
          console.log(`📄 Parsed ${users.length} users from CSV`);
          resolve();
        })
        .on('error', reject);
    });

    // Clear existing wp_users data (optional - remove if you want to preserve existing data)
    console.log('🗑️  Clearing existing wp_users data...');
    await prisma.wpUser.deleteMany({});

    // Import users in batches
    const batchSize = 50;
    let imported = 0;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const userDataBatch = batch.map((user) => ({
        ID: BigInt(user.ID),
        userLogin: user.user_login,
        userPass: user.user_pass,
        userNicename: user.user_nicename,
        userEmail: user.user_email,
        userUrl: user.user_url || null,
        userRegistered: new Date(user.user_registered),
        userActivationKey: user.user_activation_key || null,
        userStatus: parseInt(user.user_status) || 0,
        displayName: user.display_name,
      }));

      try {
        await prisma.wpUser.createMany({
          data: userDataBatch,
          skipDuplicates: true, // Skip if user already exists
        });

        imported += userDataBatch.length;
        console.log(`✅ Imported batch: ${imported}/${users.length} users`);
      } catch (error) {
        console.error(`❌ Error importing batch ${i}-${i + batchSize}:`, error);
        // Continue with next batch
      }
    }

    console.log(`🎉 Import completed! Successfully imported ${imported} WordPress users.`);

    // Verify import
    const totalUsers = await prisma.wpUser.count();
    console.log(`📊 Total users in database: ${totalUsers}`);

  } catch (error) {
    console.error('💥 Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
if (require.main === module) {
  importWpUsers();
}

export { importWpUsers };