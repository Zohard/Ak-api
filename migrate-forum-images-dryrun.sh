#!/bin/bash

# Forum Image URL Migration - DRY RUN (Preview Only)
# Shows what will be changed without modifying the database

set -e

DB_URL="postgresql://neondb_owner:npg_0Ge8EzuRbgTF@ep-tiny-glade-abx9qg4a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

echo "=========================================="
echo "Forum Image URL Migration - DRY RUN"
echo "=========================================="
echo ""
echo "This is a preview only - NO changes will be made"
echo ""
echo "URL Replacement:"
echo "  FROM: http://www.anime-kun.net/animes/anim_img/"
echo "  TO:   https://ik.imagekit.io/akimages/images/animes/"
echo ""

if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed."
    exit 1
fi

echo "📊 Impact Analysis"
echo "-----------------------------------"

psql "$DB_URL" -c "
SELECT
    COUNT(*) as total_messages_with_old_urls,
    COUNT(DISTINCT id_member) as unique_users_affected,
    COUNT(DISTINCT id_topic) as unique_topics_affected
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%';
"

echo ""
echo "📝 Sample Messages (Before & After Preview)"
echo "---------------------------------------------"

psql "$DB_URL" -c "
SELECT
    id_msg,
    id_topic,
    poster_name,
    '--- BEFORE ---' as separator,
    SUBSTRING(body FROM position('http://www.anime-kun.net/animes/anim_img/' IN body) FOR 100) as old_url_context,
    '--- AFTER (preview) ---' as separator2,
    SUBSTRING(
        REPLACE(body, 'http://www.anime-kun.net/animes/anim_img/', 'https://ik.imagekit.io/akimages/images/animes/')
        FROM position('https://ik.imagekit.io/akimages/images/animes/' IN REPLACE(body, 'http://www.anime-kun.net/animes/anim_img/', 'https://ik.imagekit.io/akimages/images/animes/')) FOR 100
    ) as new_url_context
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%'
LIMIT 3;
" -x

echo ""
echo "📋 Full Preview of First 5 Messages"
echo "-------------------------------------"

psql "$DB_URL" -c "
SELECT
    id_msg,
    poster_name,
    poster_time,
    body as original_body,
    REPLACE(body, 'http://www.anime-kun.net/animes/anim_img/', 'https://ik.imagekit.io/akimages/images/animes/') as updated_body
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%'
LIMIT 5;
" -x

echo ""
echo "ℹ️  This was a DRY RUN - no changes were made."
echo ""
echo "To perform the actual migration, run:"
echo "  ./migrate-forum-images.sh"
