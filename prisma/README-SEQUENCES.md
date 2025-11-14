# Database Sequence Management

## Problem

PostgreSQL auto-increment sequences can get out of sync when:
- Importing data with explicit IDs
- Restoring from backups
- Running manual INSERT statements with specific IDs
- Migrating data from another database

This causes `Unique constraint failed` errors when trying to create new records.

## Solution

### Quick Fix - Run the Script

Whenever you encounter a unique constraint error or after importing data:

```bash
npm run fix-sequences
```

This will automatically sync all sequences to match the current max IDs in each table.

### Manual Fix for Specific Table

If you only need to fix one table:

```bash
psql $DATABASE_URL -c "SELECT setval(pg_get_serial_sequence('table_name', 'id_column'), COALESCE((SELECT MAX(id_column) FROM table_name), 1), true);"
```

Example:
```bash
psql $DATABASE_URL -c "SELECT setval(pg_get_serial_sequence('ak_animes', 'id_anime'), COALESCE((SELECT MAX(id_anime) FROM ak_animes), 1), true);"
```

## When to Run

Run `npm run fix-sequences` after:
1. ✅ Importing/restoring database backups
2. ✅ Running data migration scripts
3. ✅ Manually inserting records with specific IDs
4. ✅ Encountering "Unique constraint failed" errors on ID fields
5. ✅ After using bulk import tools

## Tables Covered

The script fixes sequences for all major tables:
- `ak_animes` (id_anime)
- `ak_mangas` (id_manga)
- `ak_jeux_video` (id_jeu)
- `ak_screenshots` (id_screen)
- `ak_jeux_video_screenshots` (id)
- `ak_critiques` (id_critique)
- `ak_articles` (id_article)
- `smf_members` (id_member)

## Best Practices

1. **Always use auto-increment**: Don't specify IDs when creating records through the API
2. **Run after imports**: Always run `npm run fix-sequences` after any data import
3. **Include in migrations**: Add sequence fixes to migration scripts if they insert data
4. **Monitor logs**: Watch for unique constraint errors in production logs

## Adding New Tables

When adding a new table with auto-increment ID, add it to `prisma/fix-sequences.sql`:

```sql
-- Fix new_table sequence
SELECT setval(
  pg_get_serial_sequence('new_table', 'id'),
  COALESCE((SELECT MAX(id) FROM new_table), 1),
  true
);
```
