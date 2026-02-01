-- Add current_season column to ak_animes_saisons table
-- This column is used to determine the current active season instead of relying on statut = 1

ALTER TABLE ak_animes_saisons
ADD COLUMN IF NOT EXISTS current_season BOOLEAN NOT NULL DEFAULT false;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ak_animes_saisons_current_season ON ak_animes_saisons(current_season) WHERE current_season = true;
