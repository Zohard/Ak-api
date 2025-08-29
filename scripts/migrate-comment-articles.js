const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://anime_user:anime_password@localhost:5432/anime_kun"
    }
  }
});

async function migrateCommentArticles() {
  console.log('🔄 Starting comment-article migration...');
  
  try {
    // Get all existing articles
    const articles = await prisma.akWebzineArticle.findMany({
      where: {
        statut: 1 // Only published articles
      },
      select: {
        idArt: true,
        titre: true
      },
      orderBy: { idArt: 'asc' }
    });
    
    console.log(`📊 Found ${articles.length} published articles`);
    
    if (articles.length === 0) {
      console.log('❌ No published articles found. Cannot proceed with migration.');
      return;
    }
    
    // Get current PostgreSQL comments that need migration
    const pgComments = await prisma.akWebzineComment.findMany({
      where: {
        idArticle: 0
      },
      select: {
        id: true,
        idArticle: true,
        commentaire: true,
        nom: true,
        date: true
      },
      orderBy: { id: 'asc' }
    });
    
    console.log(`📊 Found ${pgComments.length} comments with id_article = 0 in PostgreSQL`);
    
    if (pgComments.length === 0) {
      console.log('✅ No comments need migration. All comments already have valid id_article values.');
      return;
    }
    
    // For testing purposes, distribute comments across the first few articles
    // This gives us a realistic distribution for testing the API
    const targetArticles = articles.slice(0, Math.min(10, articles.length));
    
    console.log(`🎯 Distributing comments across ${targetArticles.length} articles for testing`);
    
    let updatedCount = 0;
    
    for (let i = 0; i < pgComments.length; i++) {
      const comment = pgComments[i];
      // Distribute comments across articles (round-robin style)
      const targetArticle = targetArticles[i % targetArticles.length];
      
      try {
        await prisma.akWebzineComment.update({
          where: { id: comment.id },
          data: { idArticle: targetArticle.idArt }
        });
        updatedCount++;
        
        if (updatedCount % 500 === 0) {
          console.log(`🔄 Updated ${updatedCount} comments...`);
        }
      } catch (error) {
        console.error(`❌ Failed to update comment ${comment.id}:`, error.message);
      }
    }
    
    console.log(`✅ Migration completed!`);
    console.log(`   - Updated: ${updatedCount} comments`);
    
    // Update article comment counts
    console.log('🔄 Updating article comment counts...');
    
    for (const article of targetArticles) {
      const commentCount = await prisma.akWebzineComment.count({
        where: {
          idArticle: article.idArt,
          moderation: 1 // Only count approved comments
        }
      });
      
      await prisma.akWebzineArticle.update({
        where: { idArt: article.idArt },
        data: { nbCom: commentCount }
      });
      
      console.log(`   Article "${article.titre}": ${commentCount} approved comments`);
    }
    
    // Verify the migration
    const verificationResult = await prisma.akWebzineComment.groupBy({
      by: ['idArticle'],
      _count: {
        id: true
      },
      where: {
        idArticle: {
          gt: 0
        }
      },
      orderBy: {
        idArticle: 'asc'
      }
    });
    
    console.log('\n📊 Comments by article after migration:');
    verificationResult.forEach(result => {
      const article = articles.find(a => a.idArt === result.idArticle);
      console.log(`   Article ${result.idArticle} "${article?.titre || 'Unknown'}": ${result._count.id} comments`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 PostgreSQL connection closed');
  }
}

// Run the migration
if (require.main === module) {
  migrateCommentArticles()
    .then(() => {
      console.log('🎉 Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateCommentArticles };