const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://anime_user:anime_password@localhost:5432/anime_kun"
    }
  }
});

async function updateCommentsFromCSV() {
  console.log('🔄 Starting CSV-based comment update...');
  
  try {
    // Look for the CSV file
    const csvPath = path.join(__dirname, '..', 'ak_webzine_com.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('❌ CSV file not found at:', csvPath);
      console.log('Please place the ak_webzine_com.csv file in the project root directory');
      return;
    }
    
    // Read CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    
    // Parse CSV (assuming format: id,id_article or with headers)
    const csvData = [];
    let startIndex = 0;
    
    // Check if first line is headers
    if (lines[0].toLowerCase().includes('id') && lines[0].includes(',')) {
      console.log('📊 Detected CSV headers:', lines[0]);
      startIndex = 1;
    }
    
    // Parse data lines
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        // Handle quoted CSV values
        const [id, idArticle] = line.split(',').map(val => {
          // Remove quotes if present
          const cleanVal = val.trim().replace(/^"(.*)"$/, '$1');
          return parseInt(cleanVal);
        });
        if (!isNaN(id) && !isNaN(idArticle)) {
          csvData.push({ id, idArticle });
        }
      }
    }
    
    console.log(`📊 Found ${csvData.length} valid comment records in CSV`);
    
    if (csvData.length === 0) {
      console.error('❌ No valid data found in CSV file');
      return;
    }
    
    // Show sample of data
    console.log('📋 Sample CSV data:');
    csvData.slice(0, 5).forEach(row => {
      console.log(`   Comment ID ${row.id} -> Article ID ${row.idArticle}`);
    });
    
    // Update comments in batches
    let updatedCount = 0;
    let notFoundCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < csvData.length; i += batchSize) {
      const batch = csvData.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(csvData.length/batchSize)}...`);
      
      for (const row of batch) {
        try {
          // Check if comment exists
          const existingComment = await prisma.akWebzineComment.findUnique({
            where: { id: row.id }
          });
          
          if (existingComment) {
            // Update the comment with correct id_article
            await prisma.akWebzineComment.update({
              where: { id: row.id },
              data: { idArticle: row.idArticle }
            });
            updatedCount++;
          } else {
            notFoundCount++;
            console.log(`⚠️  Comment ID ${row.id} not found in database`);
          }
        } catch (error) {
          console.error(`❌ Failed to update comment ${row.id}:`, error.message);
        }
      }
    }
    
    console.log(`✅ Update completed!`);
    console.log(`   - Updated: ${updatedCount} comments`);
    console.log(`   - Not found: ${notFoundCount} comments`);
    
    // Update article comment counts
    console.log('🔄 Updating article comment counts...');
    
    // Get unique article IDs from the updated comments
    const uniqueArticleIds = [...new Set(csvData.map(row => row.idArticle))];
    
    for (const articleId of uniqueArticleIds) {
      if (articleId > 0) {
        const commentCount = await prisma.akWebzineComment.count({
          where: {
            idArticle: articleId,
            moderation: 1 // Only count approved comments
          }
        });
        
        try {
          await prisma.akWebzineArticle.update({
            where: { idArt: articleId },
            data: { nbCom: commentCount }
          });
        } catch (error) {
          console.log(`⚠️  Article ${articleId} not found or error updating count:`, error.message);
        }
      }
    }
    
    // Verify the update
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
      },
      take: 10
    });
    
    console.log('\n📊 Comments by article after CSV update (top 10):');
    for (const result of verificationResult) {
      const article = await prisma.akWebzineArticle.findUnique({
        where: { idArt: result.idArticle },
        select: { titre: true }
      });
      console.log(`   Article ${result.idArticle} "${article?.titre || 'Unknown'}": ${result._count.id} comments`);
    }
    
  } catch (error) {
    console.error('❌ Update failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 PostgreSQL connection closed');
  }
}

// Run the update
if (require.main === module) {
  updateCommentsFromCSV()
    .then(() => {
      console.log('🎉 CSV update completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 CSV update failed:', error);
      process.exit(1);
    });
}

module.exports = { updateCommentsFromCSV };