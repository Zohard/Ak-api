# Article Relations Migration Summary

## Migration Completed

Successfully migrated article-to-content relations from the old `ak_webzine_articles` system to the new WordPress-based system.

### What Was Done

1. **Database Migration**: Updated `ak_webzine_to_fiches` table records by matching old article IDs with WordPress post IDs based on URL slugs
2. **Type Assignment**: Automatically detected content type (anime/manga) and populated the `type` field
3. **WordPress Integration**: Linked old articles to their WordPress equivalents using `id_wp_article` field

### Migration Statistics

- **Manga Relations**: 287 relations migrated
  - 179 unique manga titles
  - 254 unique articles
- **Anime Relations**: Could not be fully migrated (articles not in WordPress)
- **Unmigrated Records**: ~305 records remain (articles not migrated to WordPress yet)

### Query Used

```sql
UPDATE ak_webzine_to_fiches wtf
SET 
  id_wp_article = wp."ID",
  type = CASE 
    WHEN EXISTS (SELECT 1 FROM ak_mangas WHERE id_manga = wtf.id_fiche) THEN 'manga'
    WHEN EXISTS (SELECT 1 FROM ak_animes WHERE id_anime = wtf.id_fiche) THEN 'anime'
    ELSE 'unknown'
  END
FROM ak_webzine_articles old_art
JOIN wp_posts wp ON old_art.nice_url = wp.post_name AND wp.post_type = 'post'
WHERE wtf.id_article = old_art.id_art
  AND (wtf.id_wp_article = 0 OR wtf.id_wp_article IS NULL)
  AND (wtf.type = '' OR wtf.type IS NULL);
```

### API Endpoints Added

- `GET /api/animes/:id/articles` - Get articles linked to an anime
- `GET /api/mangas/:id/articles` - Get articles linked to a manga

### Frontend Features

- Articles tab now displays on anime/manga detail pages
- Tab only appears when `articlesCount > 0`
- Shows article cover, title, publication date, and clean excerpt
- "Lire l'article" link to full article page

## Remaining Work

### Articles Not Migrated to WordPress

Approximately 305 article relations remain unmigrated because the corresponding WordPress posts don't exist or have mismatched slugs. These include:

- Old conference reports
- Some anime-related articles
- Articles with modified/different slugs in WordPress

### Next Steps

1. **Audit remaining unmigrated articles**: Determine which old articles should be migrated to WordPress
2. **Slug mapping**: Create a mapping table for articles with different slugs between old and new systems
3. **Manual review**: Some articles may need manual linking if automatic matching isn't possible
4. **Business relations**: Consider migrating business-related article links using the same pattern

## Testing

Tested with manga ID 29 (Naruto):
- ✅ 4 articles now display correctly
- ✅ API endpoint returns proper article data
- ✅ Frontend shows Articles tab with article cards
- ✅ articlesCount properly calculated (shows 4)

