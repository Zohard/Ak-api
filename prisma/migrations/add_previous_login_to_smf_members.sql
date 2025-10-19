-- Add previous_login column to smf_members table
ALTER TABLE smf_members ADD COLUMN IF NOT EXISTS previous_login INTEGER;

-- Initialize previous_login with current last_login value for existing users
UPDATE smf_members SET previous_login = last_login WHERE previous_login IS NULL AND last_login IS NOT NULL;
