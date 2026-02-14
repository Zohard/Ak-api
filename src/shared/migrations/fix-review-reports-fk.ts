import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

/**
 * Fix review reports foreign key constraint
 * This runs automatically on application startup
 */
export async function fixReviewReportsForeignKey(prisma: PrismaClient): Promise<void> {
  const logger = new Logger('DatabaseMigration');

  try {
    logger.log('Checking and fixing review reports foreign key constraint...');

    // Drop the incorrect constraint if it exists
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ak_review_reports
      DROP CONSTRAINT IF EXISTS fk_review_reports_critique;
    `);

    // Add the correct constraint
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ak_review_reports
      ADD CONSTRAINT fk_review_reports_critique
      FOREIGN KEY (id_critique) REFERENCES ak_critique(id_critique) ON DELETE CASCADE;
    `);

    logger.log('✅ Review reports foreign key constraint fixed successfully');
  } catch (error) {
    // If constraint already exists with correct name, this is fine
    if (error.code === '42710') {
      logger.log('Foreign key constraint already exists with correct configuration');
    } else {
      logger.error('Failed to fix review reports FK:', error.message);
      // Don't throw - let the app continue even if this fails
    }
  }
}
