-- Import missing personal messages and recipients
-- This script will only insert records that don't already exist

\echo 'Starting import of missing personal messages...'

-- Create temporary table for personal messages
CREATE TEMP TABLE temp_personal_messages (
    id_pm INTEGER,
    id_pm_head INTEGER,
    id_member_from INTEGER,
    deleted_by_sender SMALLINT,
    from_name VARCHAR(255),
    msgtime INTEGER,
    subject VARCHAR(255),
    body TEXT
);

-- Import CSV data into temporary table
\COPY temp_personal_messages FROM '/home/zohardus/www/anime-kun-nestjs-v2/smf_personal_messages.csv' WITH (FORMAT CSV, HEADER true);

-- Insert only missing records into actual table
INSERT INTO smf_personal_messages (id_pm, id_pm_head, id_member_from, deleted_by_sender, from_name, msgtime, subject, body)
SELECT t.id_pm, t.id_pm_head, t.id_member_from, t.deleted_by_sender,
       COALESCE(t.from_name, '') as from_name, t.msgtime, t.subject, t.body
FROM temp_personal_messages t
WHERE NOT EXISTS (
    SELECT 1 FROM smf_personal_messages p WHERE p.id_pm = t.id_pm
);

\echo 'Personal messages import completed.'

-- Create temporary table for PM recipients
CREATE TEMP TABLE temp_pm_recipients (
    id_pm INTEGER,
    id_member INTEGER,
    bcc SMALLINT,
    is_read SMALLINT,
    deleted SMALLINT,
    labels VARCHAR(60),
    is_new SMALLINT
);

-- Import CSV data into temporary table
\COPY temp_pm_recipients FROM '/home/zohardus/www/anime-kun-nestjs-v2/smf_pm_recipients.csv' WITH (FORMAT CSV, HEADER true);

-- Insert only missing records into actual table
INSERT INTO smf_pm_recipients (id_pm, id_member, bcc, is_read, deleted, labels, is_new)
SELECT t.id_pm, t.id_member, t.bcc, t.is_read, t.deleted, t.labels, t.is_new
FROM temp_pm_recipients t
WHERE NOT EXISTS (
    SELECT 1 FROM smf_pm_recipients r WHERE r.id_pm = t.id_pm AND r.id_member = t.id_member
);

\echo 'PM recipients import completed.'

-- Show final counts
SELECT 'Personal Messages' as table_name, COUNT(*) as total_records FROM smf_personal_messages
UNION ALL
SELECT 'PM Recipients' as table_name, COUNT(*) as total_records FROM smf_pm_recipients;

\echo 'Import process completed successfully!'