-- Migration: Replace newline characters with <br> tags in synopsis fields
-- Date: 2025-01-17
-- Status: APPLIED TO PRODUCTION
-- Description: Clean up synopsis formatting by converting both actual newlines and literal \r\n strings to HTML br tags

-- PART 1: Replace actual newline characters (E'\r\n', E'\n', E'\r')
BEGIN;

-- Fix ak_animes synopsis - actual newline characters
UPDATE ak_animes
SET synopsis = REPLACE(REPLACE(REPLACE(synopsis, E'\r\n', '<br>'), E'\n', '<br>'), E'\r', '<br>')
WHERE synopsis LIKE '%' || E'\n' || '%'
   OR synopsis LIKE '%' || E'\r' || '%';

-- Fix ak_mangas synopsis - actual newline characters
UPDATE ak_mangas
SET synopsis = REPLACE(REPLACE(REPLACE(synopsis, E'\r\n', '<br>'), E'\n', '<br>'), E'\r', '<br>')
WHERE synopsis LIKE '%' || E'\n' || '%'
   OR synopsis LIKE '%' || E'\r' || '%';

COMMIT;

-- Results Part 1:
-- - Updated 1,377 anime records
-- - Updated 1,048 manga records
-- - All actual newline characters converted to <br> tags

-- PART 2: Replace literal backslash-n strings ('\r\n', '\n', '\r')
BEGIN;

-- Fix ak_animes synopsis - literal \r\n, \n, \r strings
UPDATE ak_animes
SET synopsis = REPLACE(REPLACE(REPLACE(synopsis, '\r\n', '<br>'), '\n', '<br>'), '\r', '<br>')
WHERE synopsis LIKE '%\\r\\n%'
   OR synopsis LIKE '%\\n%'
   OR synopsis LIKE '%\\r%';

-- Fix ak_mangas synopsis - literal \r\n, \n, \r strings
UPDATE ak_mangas
SET synopsis = REPLACE(REPLACE(REPLACE(synopsis, '\r\n', '<br>'), '\n', '<br>'), '\r', '<br>')
WHERE synopsis LIKE '%\\r\\n%'
   OR synopsis LIKE '%\\n%'
   OR synopsis LIKE '%\\r%';

COMMIT;

-- Results Part 2:
-- - Updated 33 anime records (21 with \r\n, 12 with \n)
-- - Updated 7 manga records (1 with \r\n, 6 with \n)
-- - All literal backslash-n strings converted to <br> tags
-- - 0 remaining newline representations in both tables
