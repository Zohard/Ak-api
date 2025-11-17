-- Migration: Replace \r\n newline characters with <br> tags in synopsis fields
-- Date: 2025-01-17
-- Status: APPLIED TO PRODUCTION
-- Description: Clean up synopsis formatting by converting newlines to HTML br tags

BEGIN;

-- Fix ak_animes synopsis
-- Replace \r\n first (Windows line endings), then \n (Unix), then remaining \r (old Mac)
UPDATE ak_animes
SET synopsis = REPLACE(REPLACE(REPLACE(synopsis, E'\r\n', '<br>'), E'\n', '<br>'), E'\r', '<br>')
WHERE synopsis LIKE '%' || E'\n' || '%'
   OR synopsis LIKE '%' || E'\r' || '%';

-- Fix ak_mangas synopsis
UPDATE ak_mangas
SET synopsis = REPLACE(REPLACE(REPLACE(synopsis, E'\r\n', '<br>'), E'\n', '<br>'), E'\r', '<br>')
WHERE synopsis LIKE '%' || E'\n' || '%'
   OR synopsis LIKE '%' || E'\r' || '%';

COMMIT;

-- Results:
-- - Updated 1,377 anime records
-- - Updated 1,048 manga records
-- - All \r and \n characters successfully converted to <br> tags
-- - 0 remaining newline characters in both tables
