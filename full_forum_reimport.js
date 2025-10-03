const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_0Ge8EzuRbgTF@ep-tiny-glade-abx9qg4a.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
    }
  }
});

async function reimportForumData() {
  console.log('=== FULL FORUM DATA REIMPORT ===\n');

  try {
    // Step 1: Get current counts
    console.log('Step 1: Checking current database state...');
    const currentTopics = await prisma.smfTopic.count();
    const currentMessages = await prisma.smfMessage.count();
    console.log(`Current topics in DB: ${currentTopics}`);
    console.log(`Current messages in DB: ${currentMessages}\n`);

    // Step 2: Read and parse topics CSV
    console.log('Step 2: Reading topics CSV...');
    const topicsCsvPath = '/home/zohardus/www/frontendv2/smf_topics.csv';
    const topicsCsvContent = fs.readFileSync(topicsCsvPath, 'utf-8');
    const topicsRecords = parse(topicsCsvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true
    });
    console.log(`Topics in CSV: ${topicsRecords.length}\n`);

    // Step 3: Read and parse messages CSV
    console.log('Step 3: Reading messages CSV (this may take a while)...');
    const messagesCsvPath = '/home/zohardus/www/anime-kun-nestjs-v2/smf_messages.csv';
    const messagesCsvContent = fs.readFileSync(messagesCsvPath, 'utf-8');
    const messagesRecords = parse(messagesCsvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true
    });
    console.log(`Messages in CSV: ${messagesRecords.length}\n`);

    // Step 4: Get existing IDs to avoid duplicates
    console.log('Step 4: Fetching existing message IDs...');
    const existingMessages = await prisma.smfMessage.findMany({
      select: { idMsg: true }
    });
    const existingMsgIds = new Set(existingMessages.map(m => m.idMsg));
    console.log(`Existing messages in DB: ${existingMsgIds.size}\n`);

    // Step 5: Filter missing messages
    console.log('Step 5: Identifying missing messages...');
    const missingMessages = messagesRecords.filter(m => !existingMsgIds.has(parseInt(m.id_msg)));
    console.log(`Missing messages to import: ${missingMessages.length}\n`);

    if (missingMessages.length === 0) {
      console.log('No missing messages found. Skipping import.');
      return;
    }

    // Step 6: Group messages by topic to check member existence
    console.log('Step 6: Analyzing message data...');
    const messagesByTopic = {};
    const memberIds = new Set();
    const boardIds = new Set();

    for (const msg of missingMessages) {
      const topicId = parseInt(msg.id_topic);
      const memberId = parseInt(msg.id_member) || 0;
      const boardId = parseInt(msg.id_board);

      if (!messagesByTopic[topicId]) {
        messagesByTopic[topicId] = [];
      }
      messagesByTopic[topicId].push(msg);

      if (memberId > 0) memberIds.add(memberId);
      boardIds.add(boardId);
    }

    console.log(`Unique topics with missing messages: ${Object.keys(messagesByTopic).length}`);
    console.log(`Unique members referenced: ${memberIds.size}`);
    console.log(`Unique boards referenced: ${boardIds.size}\n`);

    // Step 7: Check which members exist
    console.log('Step 7: Checking member existence...');
    const existingMembers = await prisma.smfMember.findMany({
      where: { idMember: { in: Array.from(memberIds) } },
      select: { idMember: true }
    });
    const existingMemberIds = new Set(existingMembers.map(m => m.idMember));
    const missingMemberIds = Array.from(memberIds).filter(id => !existingMemberIds.has(id));
    console.log(`Existing members: ${existingMemberIds.size}`);
    console.log(`Missing members: ${missingMemberIds.length}\n`);

    // Step 8: Import missing messages in batches
    console.log('Step 8: Starting message import...');
    const batchSize = 500;
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < missingMessages.length; i += batchSize) {
      const batch = missingMessages.slice(i, i + batchSize);

      try {
        const result = await prisma.smfMessage.createMany({
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

        imported += result.count;
        console.log(`Progress: ${imported + skipped + errors}/${missingMessages.length} processed (imported: ${imported}, skipped: ${skipped}, errors: ${errors})`);
      } catch (error) {
        errors += batch.length;
        console.error(`Error importing batch ${i}-${i + batch.length}:`, error.message);

        // Try importing one by one for this batch
        for (const msg of batch) {
          try {
            await prisma.smfMessage.create({
              data: {
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
              }
            });
            imported++;
            errors--;
          } catch (singleError) {
            console.error(`Failed to import message ${msg.id_msg}:`, singleError.message);
            skipped++;
            errors--;
          }
        }
      }
    }

    console.log(`\nStep 9: Import complete!`);
    console.log(`Total imported: ${imported}`);
    console.log(`Total skipped: ${skipped}`);
    console.log(`Total errors: ${errors}\n`);

    // Step 10: Update num_replies for all affected topics
    console.log('Step 10: Updating num_replies for all topics...');
    const affectedTopicIds = Object.keys(messagesByTopic).map(id => parseInt(id));

    for (let i = 0; i < affectedTopicIds.length; i += 100) {
      const topicBatch = affectedTopicIds.slice(i, i + 100);

      for (const topicId of topicBatch) {
        try {
          const messageCount = await prisma.smfMessage.count({
            where: { idTopic: topicId }
          });

          if (messageCount > 0) {
            await prisma.smfTopic.update({
              where: { idTopic: topicId },
              data: { numReplies: messageCount - 1 }
            });
          }
        } catch (error) {
          console.error(`Error updating topic ${topicId}:`, error.message);
        }
      }

      console.log(`Updated ${Math.min(i + 100, affectedTopicIds.length)}/${affectedTopicIds.length} topics...`);
    }

    console.log('\n=== REIMPORT COMPLETE ===');
    console.log(`Final message count: ${await prisma.smfMessage.count()}`);

  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  }
}

reimportForumData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });