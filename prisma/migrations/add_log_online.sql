-- Create smf_log_online table for activity tracking
CREATE TABLE IF NOT EXISTS smf_log_online (
  session VARCHAR(128) PRIMARY KEY,
  log_time INTEGER NOT NULL,
  id_member INTEGER NOT NULL DEFAULT 0,
  id_spider INTEGER NOT NULL DEFAULT 0,
  ip VARCHAR(45),
  url VARCHAR(2048) NOT NULL DEFAULT ''
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_smf_log_online_log_time ON smf_log_online(log_time);
CREATE INDEX IF NOT EXISTS idx_smf_log_online_id_member ON smf_log_online(id_member);

-- Add foreign key constraint to smf_members (optional, with cascade delete)
ALTER TABLE smf_log_online
  ADD CONSTRAINT fk_log_online_member
  FOREIGN KEY (id_member)
  REFERENCES smf_members(id_member)
  ON DELETE CASCADE;
