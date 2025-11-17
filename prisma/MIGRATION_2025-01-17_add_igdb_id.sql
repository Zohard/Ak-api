-- Migration: Add igdb_id column to ak_jeux_video
-- Date: 2025-01-17
-- Status: APPLIED TO PRODUCTION
-- Description: Store IGDB game ID to enable fetching additional data (screenshots, trailers) after initial import

BEGIN;

-- Add igdb_id column
ALTER TABLE ak_jeux_video
ADD COLUMN igdb_id INTEGER;

-- Create index for faster lookups
CREATE INDEX idx_ak_jeux_video_igdb_id ON ak_jeux_video(igdb_id);

-- Add column comment
COMMENT ON COLUMN ak_jeux_video.igdb_id IS 'IGDB game ID for fetching additional data';

COMMIT;

-- Notes:
-- - Allows fetching screenshots and trailers from IGDB for existing games
-- - Will be populated automatically for new IGDB imports
-- - Existing games without IGDB ID can have it added manually if needed
