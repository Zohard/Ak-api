-- Migration script to update forum image URLs from anime-kun.net to ImageKit CDN
-- This script replaces http://www.anime-kun.net/animes/anim_img/ with https://ik.imagekit.io/akimages/images/animes/

-- First, check how many rows will be affected
SELECT
    COUNT(*) as total_messages_affected,
    COUNT(DISTINCT id_member) as unique_users_affected
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%';

-- Preview some examples before updating (limit to 5 for safety)
SELECT
    id_msg,
    id_topic,
    poster_name,
    LEFT(body, 200) as body_preview
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%'
LIMIT 5;

-- Begin transaction for safe rollback if needed
BEGIN;

-- Perform the update
UPDATE smf_messages
SET body = REPLACE(
    body,
    'http://www.anime-kun.net/animes/anim_img/',
    'https://ik.imagekit.io/akimages/images/animes/'
)
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%';

-- Show how many rows were affected
SELECT 'Updated ' || COUNT(*) || ' messages' as result
FROM smf_messages
WHERE body LIKE '%https://ik.imagekit.io/akimages/images/animes/%'
  AND body NOT LIKE '%http://www.anime-kun.net/animes/anim_img/%';

-- Verify a few updated rows
SELECT
    id_msg,
    id_topic,
    poster_name,
    LEFT(body, 200) as body_preview
FROM smf_messages
WHERE body LIKE '%https://ik.imagekit.io/akimages/images/animes/%'
LIMIT 5;

-- IMPORTANT: Review the results above
-- If everything looks good, COMMIT the transaction:
-- COMMIT;

-- If something looks wrong, ROLLBACK:
-- ROLLBACK;

-- For now, we'll leave it uncommitted so you can review
-- Uncomment one of the lines above to complete the migration
