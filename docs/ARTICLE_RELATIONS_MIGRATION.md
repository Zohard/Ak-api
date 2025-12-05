# Article Relations Migration Summary

## Migration Completed ✅

Successfully migrated article-to-content relations from the old `ak_webzine_articles` system to the new WordPress-based system for **both animes and mangas**.

### What Was Done

1. **Database Migration**: Updated `ak_webzine_to_fiches` table records by matching old article IDs with WordPress post IDs based on URL slugs
2. **Type Detection**: Used article title patterns to correctly classify content:
   - Articles with "Episode"/"Épisode" → anime
   - Articles with "Tome"/"T##" → manga  
3. **WordPress Integration**: Linked old articles to their WordPress equivalents using `id_wp_article` field

### Migration Statistics

- **Manga Relations**: 340 relations migrated
  - 273 unique manga titles with articles
- **Anime Relations**: 72 relations migrated
  - 19 unique anime titles with articles
- **Total Success**: 412 article relations migrated
- **Unmigrated Records**: ~355 records remain (articles not migrated to WordPress or mismatched slugs)

### Challenge Solved

The old system had **overlapping IDs** between anime and manga tables (e.g., ID 3032 = both an anime "Kurogane no Linebarrels" AND a manga "Darker than BLACK"). The migration used article title keywords to correctly determine the content type:

```sql
-- Initial migration: match by slug and set id_wp_article
UPDATE ak_webzine_to_fiches wtf
SET id_wp_article = wp."ID"
FROM ak_webzine_articles old_art
JOIN wp_posts wp ON old_art.nice_url = wp.post_name
WHERE wtf.id_article = old_art.id_art;

-- Fix type field using article content patterns
UPDATE ak_webzine_to_fiches wtf
SET type = 'anime'
FROM ak_webzine_articles old_art
WHERE wtf.id_article = old_art.id_art
  AND (old_art.titre ILIKE '%episode%' OR old_art.titre ILIKE '%épisode%')
  AND EXISTS (SELECT 1 FROM ak_animes WHERE id_anime = wtf.id_fiche);
```

### API Endpoints

- `GET /api/animes/:id/articles` - Get articles linked to an anime
- `GET /api/mangas/:id/articles` - Get articles linked to a manga

Both endpoints return:
- Article ID, title, excerpt, content
- Publication date
- Slug for article URL
- Cover image (if available)

### Frontend Features

- **Articles tab** displays on anime/manga detail pages
- **Conditional display**: Tab only appears when `articlesCount > 0`
- **Clean UI**: Shows article cover, title, publication date ("Publié le..."), and clean excerpt (HTML/BBCode stripped)
- **Direct link**: "Lire l'article" button to full article page

## Testing Results

### Manga Example: Naruto (ID 29)
✅ 4 articles display correctly:
- Naruto T41-T42 - Destins scellés (Jul 2009)
- Naruto T40 : Un peu plus loin dans le fan service (Mar 2009)  
- Naruto - Tome 39 par Masashi Kishimito (Jan 2009)
- Naruto tome 38 (Nov 2008)

### Anime Example: Kurogane no Linebarrels (ID 3032)
✅ 9 episode review articles display correctly:
- Episodes 8-16 reviews from 2008-2009

## Remaining Work

### Articles Not Migrated to WordPress

Approximately 355 article relations remain unmigrated because:
- WordPress posts don't exist for those old articles
- Article slugs were changed during WordPress migration
- Old articles that were never published to WordPress

### Next Steps

1. **Audit remaining unmigrated articles**: Determine which old articles should be migrated to WordPress
2. **Slug mapping table**: Create mapping for articles with different slugs between systems
3. **Manual review**: Some articles may need manual linking
4. **Business relations**: Consider migrating business-related article links using same pattern

