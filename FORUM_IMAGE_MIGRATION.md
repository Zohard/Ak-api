# Forum Image URL Migration

This migration updates all forum message image URLs from the old anime-kun.net server to the new ImageKit CDN.

## What it does

Replaces all occurrences of:
```
http://www.anime-kun.net/animes/anim_img/
```

With:
```
https://ik.imagekit.io/akimages/images/animes/
```

This affects the `body` column in the `smf_messages` table.

## Prerequisites

- PostgreSQL client tools (`psql`) must be installed
- Access to the Neon database

## Usage

### 1. Preview Changes (Recommended First Step)

Run the dry-run script to see what will be changed WITHOUT modifying the database:

```bash
./migrate-forum-images-dryrun.sh
```

This will show:
- How many messages will be affected
- How many unique users/topics are involved
- Preview of the actual URL changes
- Sample messages before and after

### 2. Run the Migration

Once you've reviewed the dry-run output and are satisfied:

```bash
./migrate-forum-images.sh
```

This script will:
1. Show affected row count
2. Preview sample messages
3. Ask for confirmation
4. Perform the migration in a transaction
5. Show verification results

### 3. Manual Migration (Advanced)

If you prefer to run the SQL manually with more control:

```bash
psql 'postgresql://neondb_owner:npg_0Ge8EzuRbgTF@ep-tiny-glade-abx9qg4a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -f migrate-forum-images.sql
```

The SQL file includes:
- Preview queries to see affected rows
- Transaction with BEGIN/COMMIT
- Verification queries

**Important:** The SQL file leaves the transaction uncommitted by default. You must manually type `COMMIT;` to confirm the changes, or `ROLLBACK;` to cancel.

## Safety Features

✅ **Transaction-based**: All changes are wrapped in a transaction
✅ **Preview mode**: Dry-run script shows changes without modifying data
✅ **Confirmation prompt**: Interactive script asks before proceeding
✅ **Selective update**: Only updates rows containing the old URL pattern
✅ **Verification**: Shows results after migration

## Rollback

If you used the manual SQL method and haven't committed:
```sql
ROLLBACK;
```

If you've already committed, you would need to reverse the replacement:
```sql
UPDATE smf_messages
SET body = REPLACE(
    body,
    'https://ik.imagekit.io/akimages/images/animes/',
    'http://www.anime-kun.net/animes/anim_img/'
)
WHERE body LIKE '%https://ik.imagekit.io/akimages/images/animes/%';
```

## Expected Impact

The migration will:
- ✅ Update image URLs in forum posts to use the new CDN
- ✅ Improve image loading performance (CDN optimization)
- ✅ Ensure images continue to load correctly
- ⚠️ Modify the `smf_messages.body` column for affected rows

## Verification

After migration, verify images load correctly by:
1. Visiting forum topics with images
2. Checking browser DevTools Network tab for successful image loads
3. Confirming images display from `ik.imagekit.io` domain
