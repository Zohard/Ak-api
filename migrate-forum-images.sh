#!/bin/bash

# Forum Image URL Migration Script
# Replaces http://www.anime-kun.net/animes/anim_img/ with https://ik.imagekit.io/akimages/images/animes/

set -e  # Exit on error

DB_URL="postgresql://neondb_owner:npg_0Ge8EzuRbgTF@ep-tiny-glade-abx9qg4a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

echo "=========================================="
echo "Forum Image URL Migration Tool"
echo "=========================================="
echo ""
echo "This script will update image URLs in forum messages:"
echo "  FROM: http://www.anime-kun.net/animes/anim_img/"
echo "  TO:   https://ik.imagekit.io/akimages/images/animes/"
echo ""
echo "⚠️  WARNING: This will modify your database!"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed. Please install PostgreSQL client tools."
    exit 1
fi

echo "Step 1: Checking affected rows..."
echo "-----------------------------------"

psql "$DB_URL" -c "
SELECT
    COUNT(*) as total_messages_affected,
    COUNT(DISTINCT id_member) as unique_users_affected
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%';
"

echo ""
echo "Step 2: Preview of messages to be updated..."
echo "---------------------------------------------"

psql "$DB_URL" -c "
SELECT
    id_msg,
    poster_name,
    LEFT(body, 150) as body_preview
FROM smf_messages
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%'
LIMIT 5;
"

echo ""
read -p "Do you want to proceed with the migration? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Migration cancelled."
    exit 0
fi

echo ""
echo "Step 3: Performing migration..."
echo "--------------------------------"

psql "$DB_URL" <<EOF
BEGIN;

UPDATE smf_messages
SET body = REPLACE(
    body,
    'http://www.anime-kun.net/animes/anim_img/',
    'https://ik.imagekit.io/akimages/images/animes/'
)
WHERE body LIKE '%http://www.anime-kun.net/animes/anim_img/%';

-- Show results
SELECT 'Updated ' || COUNT(*) || ' messages' as result
FROM smf_messages
WHERE body LIKE '%https://ik.imagekit.io/akimages/images/animes/%';

COMMIT;
EOF

echo ""
echo "✅ Migration completed successfully!"
echo ""
echo "Step 4: Verification..."
echo "------------------------"

psql "$DB_URL" -c "
SELECT
    id_msg,
    poster_name,
    LEFT(body, 150) as body_preview
FROM smf_messages
WHERE body LIKE '%https://ik.imagekit.io/akimages/images/animes/%'
LIMIT 5;
"

echo ""
echo "✅ Done! Image URLs have been updated."
