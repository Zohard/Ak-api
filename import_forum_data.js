const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importForumData() {
  try {
    console.log('Starting forum data import...');

    // Check current state
    const beforeStats = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_messages,
        COUNT(CASE WHEN subject = '' OR subject IS NULL OR subject = 'Untitled' THEN 1 END) as missing_subjects,
        COUNT(CASE WHEN poster_time = 0 THEN 1 END) as missing_timestamps
      FROM smf_messages
    `;

    console.log('BEFORE IMPORT:', beforeStats[0]);

    // Read and parse CSV files
    const messagesCSV = fs.readFileSync('/home/zohardus/www/frontendv2/smf_messages.csv', 'utf8');
    const topicsCSV = fs.readFileSync('/home/zohardus/www/frontendv2/smf_topics.csv', 'utf8');

    // Parse CSV (simple parser for this use case)
    function parseCSV(csvText) {
      const lines = csvText.split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
      const data = [];

      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          // Simple CSV parsing - this may need adjustment for complex data
          const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          const row = {};
          headers.forEach((header, index) => {
            if (values[index]) {
              row[header] = values[index].replace(/^"|"$/g, '').replace(/""/g, '"');
            }
          });
          data.push(row);
        }
      }
      return data;
    }

    console.log('Parsing CSV files...');
    const messagesData = parseCSV(messagesCSV);
    const topicsData = parseCSV(topicsCSV);

    console.log(`Found ${messagesData.length} messages and ${topicsData.length} topics in CSV`);

    // Update messages with missing data
    let updatedMessages = 0;

    for (const msgData of messagesData.slice(0, 100)) { // Start with first 100 for testing
      try {
        const idMsg = parseInt(msgData.id_msg);
        const posterTime = parseInt(msgData.poster_time);

        if (idMsg && msgData.subject && posterTime > 0) {
          const result = await prisma.smfMessage.updateMany({
            where: {
              idMsg: idMsg,
              OR: [
                { subject: '' },
                { subject: null },
                { subject: 'Untitled' },
                { posterTime: 0 },
                { posterTime: null }
              ]
            },
            data: {
              subject: msgData.subject,
              posterTime: posterTime,
              body: msgData.body || '',
              posterName: msgData.poster_name || '',
              posterEmail: msgData.poster_email || '',
              posterIp: msgData.poster_ip || ''
            }
          });

          if (result.count > 0) {
            updatedMessages++;
            if (updatedMessages % 10 === 0) {
              console.log(`Updated ${updatedMessages} messages...`);
            }
          }
        }
      } catch (error) {
        console.log(`Error updating message ${msgData.id_msg}:`, error.message);
      }
    }

    console.log(`Updated ${updatedMessages} messages`);

    // Check final state
    const afterStats = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_messages,
        COUNT(CASE WHEN subject = '' OR subject IS NULL OR subject = 'Untitled' THEN 1 END) as missing_subjects,
        COUNT(CASE WHEN poster_time = 0 THEN 1 END) as missing_timestamps
      FROM smf_messages
    `;

    console.log('AFTER IMPORT:', afterStats[0]);

    // Show sample of fixed topics
    const sampleTopics = await prisma.$queryRaw`
      SELECT
        t.id_topic,
        t.id_first_msg,
        m.subject,
        m.poster_time,
        m.poster_name
      FROM smf_topics t
      LEFT JOIN smf_messages m ON t.id_first_msg = m.id_msg
      WHERE t.id_board = 2
      ORDER BY t.id_topic DESC
      LIMIT 5
    `;

    console.log('Sample fixed topics:', sampleTopics);
    console.log('Forum data import completed!');

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importForumData();