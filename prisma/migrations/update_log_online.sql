-- Update smf_log_online table to match new schema requirements

-- NOTE: This will clear old session data (>15 minutes old anyway)
-- We'll start fresh with the new tracking system

-- 1. Clear old data (sessions older than 15 minutes are expired anyway)
TRUNCATE TABLE smf_log_online;

-- 2. Increase session column size from VARCHAR(32) to VARCHAR(128)
ALTER TABLE smf_log_online ALTER COLUMN session TYPE VARCHAR(128);

-- 3. Change ip from INTEGER to VARCHAR(45) for IPv6 support
ALTER TABLE smf_log_online ALTER COLUMN ip DROP NOT NULL;
ALTER TABLE smf_log_online ALTER COLUMN ip DROP DEFAULT;
ALTER TABLE smf_log_online ALTER COLUMN ip TYPE VARCHAR(45) USING NULL;

-- 4. Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_smf_log_online_log_time ON smf_log_online(log_time);
CREATE INDEX IF NOT EXISTS idx_smf_log_online_id_member ON smf_log_online(id_member);

-- 5. Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_log_online_member'
  ) THEN
    ALTER TABLE smf_log_online
      ADD CONSTRAINT fk_log_online_member
      FOREIGN KEY (id_member)
      REFERENCES smf_members(id_member)
      ON DELETE CASCADE;
  END IF;
END $$;
