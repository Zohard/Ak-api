-- Migration: Add decimal rating support to collection tables
-- Date: 2025-01-17
-- Status: APPLIED TO PRODUCTION
-- Description: Change evaluation column from smallint to NUMERIC(3,1) to support half-star ratings

BEGIN;

-- Update collection_animes to support decimal ratings
ALTER TABLE collection_animes ALTER COLUMN evaluation TYPE NUMERIC(3,1);

-- Update collection_mangas to support decimal ratings
ALTER TABLE collection_mangas ALTER COLUMN evaluation TYPE NUMERIC(3,1);

-- Update collection_jeuxvideo to support decimal ratings
ALTER TABLE collection_jeuxvideo ALTER COLUMN evaluation TYPE NUMERIC(3,1);

COMMIT;

-- Notes:
-- - NUMERIC(3,1) allows values from 0.0 to 99.9 with 1 decimal place
-- - This enables half-star ratings: 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0
-- - Existing integer values are automatically converted and remain valid
-- - Old ratings (e.g., 10/10 scale) are preserved as-is for backward compatibility
-- - Applied to Neon database on 2025-01-17
