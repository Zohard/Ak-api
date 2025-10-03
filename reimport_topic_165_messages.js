const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_0Ge8EzuRbgTF@ep-tiny-glade-abx9qg4a.eu-west-2.aws.neon.tech/neondb?sslmode=require'
    }
  }
});

async function reimportTopic165Messages() {
  console.log('Reading CSV file...');
  const csvContent = fs.readFileSync('smf_messages.csv', 'utf-8');

  console.log('Parsing CSV...');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });

  console.log(`Total records in CSV: ${records.length}`);

  // Filter messages for topic 165
  const topic165Messages = records.filter(r => r.id_topic === '165');
  console.log(`Messages for topic 165 in CSV: ${topic165Messages.length}`);

  // Get existing message IDs from database
  const existingMessages = await prisma.smfMessage.findMany({
    where: { idTopic: 165 },
    select: { idMsg: true }
  });
  const existingIds = new Set(existingMessages.map(m => m.idMsg));
  console.log(`Existing messages in DB: ${existingIds.size}`);

  // Find missing messages
  const missingMessages = topic165Messages.filter(m => !existingIds.has(parseInt(m.id_msg)));
  console.log(`Missing messages to import: ${missingMessages.length}`);

  // Import missing messages in batches
  const batchSize = 100;
  let imported = 0;

  for (let i = 0; i < missingMessages.length; i += batchSize) {
    const batch = missingMessages.slice(i, i + batchSize);

    try {
      await prisma.smfMessage.createMany({
        data: batch.map(msg => ({
          idMsg: parseInt(msg.id_msg),
          idTopic: parseInt(msg.id_topic),
          idBoard: parseInt(msg.id_board),
          posterTime: parseInt(msg.poster_time),
          idMember: parseInt(msg.id_member) || 0,
          idMsgModified: parseInt(msg.id_msg_modified) || 0,
          subject: msg.subject || '',
          posterName: msg.poster_name || '',
          posterEmail: msg.poster_email || '',
          posterIp: msg.poster_ip || '',
          smileysEnabled: msg.smileys_enabled === '1',
          modifiedTime: parseInt(msg.modified_time) || 0,
          modifiedName: msg.modified_name || '',
          body: msg.body || '',
          icon: msg.icon || 'xx',
          approved: parseInt(msg.approved) || 1
        })),
        skipDuplicates: true
      });

      imported += batch.length;
      console.log(`Imported ${imported}/${missingMessages.length} messages...`);
    } catch (error) {
      console.error(`Error importing batch starting at ${i}:`, error.message);
    }
  }

  // Update topic num_replies
  const totalMessages = await prisma.smfMessage.count({
    where: { idTopic: 165 }
  });

  await prisma.smfTopic.update({
    where: { idTopic: 165 },
    data: { numReplies: totalMessages - 1 }
  });

  console.log(`\nImport complete!`);
  console.log(`Total messages for topic 165: ${totalMessages}`);
  console.log(`Updated num_replies to: ${totalMessages - 1}`);
}

reimportTopic165Messages()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });