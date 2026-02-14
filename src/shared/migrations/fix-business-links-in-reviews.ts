import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

/**
 * Fix broken business links in review content
 * Finds links like /business/cool-kyoushinja and adds missing IDs
 */
export async function fixBusinessLinksInReviews(prisma: PrismaClient): Promise<void> {
  const logger = new Logger('FixBusinessLinksInReviews');

  try {
    logger.log('Starting business links fix in reviews...');

    // Find all reviews with business links (both with and without IDs)
    const reviews = await prisma.akCritique.findMany({
      where: {
        critique: {
          contains: '/business/',
        },
      },
      select: {
        idCritique: true,
        critique: true,
      },
    });

    logger.log(`Found ${reviews.length} reviews with potential business links`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const review of reviews) {
      let content = review.critique;
      let modified = false;

      // Find all business links without IDs: /business/slug (not followed by a dash and number)
      // Match pattern: /business/[slug] where it's NOT followed by -[number]
      const brokenLinkRegex = /href="\/business\/([a-z0-9-]+)"(?!\s*[^>]*-\d)/gi;
      const matches = [...content.matchAll(brokenLinkRegex)];

      if (matches.length === 0) {
        skippedCount++;
        continue;
      }

      logger.log(`Review ${review.idCritique}: Found ${matches.length} potentially broken links`);

      for (const match of matches) {
        const slug = match[1];

        // Look up the business by denomination (slug-ified)
        // We need to find businesses where the slug matches
        const businesses = await prisma.akBusiness.findMany({
          where: {
            denomination: {
              contains: slug.replace(/-/g, ' '),
              mode: 'insensitive',
            },
          },
          select: {
            idBusiness: true,
            denomination: true,
          },
          take: 5, // Get a few to find the best match
        });

        if (businesses.length === 0) {
          logger.warn(`  Could not find business for slug: ${slug}`);
          continue;
        }

        // Helper function to create slug from text
        const createSlug = (text: string): string => {
          return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        };

        // Find the best matching business
        let bestMatch = businesses[0];
        for (const biz of businesses) {
          const bizSlug = createSlug(biz.denomination);
          if (bizSlug === slug) {
            bestMatch = biz;
            break;
          }
        }

        // Replace the broken link with the fixed one
        const oldHref = `/business/${slug}`;
        const newHref = `/business/${slug}-${bestMatch.idBusiness}`;

        content = content.replace(
          new RegExp(`href="${oldHref}"`, 'g'),
          `href="${newHref}"`
        );

        modified = true;
        logger.log(`  Fixed link: ${oldHref} -> ${newHref} (${bestMatch.denomination})`);
      }

      if (modified) {
        // Update the review with fixed content
        await prisma.akCritique.update({
          where: { idCritique: review.idCritique },
          data: { critique: content },
        });

        fixedCount++;
        logger.log(`  ✅ Updated review ${review.idCritique}`);
      }
    }

    logger.log(`
✅ Business links fix completed
   - Total reviews checked: ${reviews.length}
   - Reviews fixed: ${fixedCount}
   - Reviews skipped (no broken links): ${skippedCount}
    `);

  } catch (error) {
    logger.error('Failed to fix business links in reviews:', error.message);
    // Don't throw - this is a non-critical migration
  }
}
