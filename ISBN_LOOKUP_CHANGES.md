# ISBN Lookup - Local Database Search Implementation

## Summary

Updated the ISBN barcode scanner to search the local `ak_mangas` database instead of AniList API. This provides better matching for French manga editions and shows results with similarity scores.

## Changes Made

### Backend Changes

#### 1. Modified `mangas.service.ts` - `lookupByIsbn()` method

**What changed:**
- Removed AniList API search
- Added PostgreSQL trigram similarity search on `ak_mangas` table
- Implemented relevance scoring using `SIMILARITY()` function
- Returns local manga matches with similarity percentage

**Key features:**
- Searches across multiple title fields: `titre`, `titre_orig`, `titre_fr`, `titres_alternatifs`
- Uses 30% minimum similarity threshold (flexible matching)
- Returns top 10 matches ordered by similarity score
- Converts similarity to percentage (0-100%)
- Shows green badge for 70%+ matches, yellow for 50-69%

**SQL Query:**
```sql
SELECT
  id_manga, titre, auteur, image, annee, nb_volumes, synopsis,
  origine, editeur, nice_url, moyenne_notes,
  GREATEST(
    SIMILARITY(titre, ?),
    SIMILARITY(COALESCE(titre_orig, ''), ?),
    SIMILARITY(COALESCE(titre_fr, ''), ?),
    SIMILARITY(COALESCE(titres_alternatifs, ''), ?)
  ) as similarity_score
FROM ak_mangas
WHERE statut = 1
  AND (SIMILARITY(titre, ?) >= 0.3 OR ...)
ORDER BY similarity_score DESC
LIMIT 10
```

### Frontend Changes

#### 2. Updated `BarcodeScannerV2.vue`

**What changed:**
- Changed from `anilistResults` to `mangaResults`
- Updated UI to display local manga data
- Added similarity score badges with color coding:
  - **Green** (70%+): High confidence match
  - **Yellow** (50-69%): Medium confidence
  - **Gray** (<50%): Low confidence
- Display manga metadata: author, year, volumes, publisher, rating
- Improved error handling for missing images

**UI Improvements:**
- Shows similarity percentage prominently
- Color-coded badges for quick visual assessment
- Displays more relevant metadata (publisher, year, rating)
- Better fallback for missing cover images

### Database Requirements

#### PostgreSQL Extension: `pg_trgm`

The similarity search requires the PostgreSQL trigram extension.

**To enable:**
```bash
# Run the provided SQL script
psql -d your_database -f enable-pg-trgm.sql
```

**Or manually:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Verification:**
```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
```

### Performance Optimization (Optional)

For better search performance on large databases, you can create GIN indexes:

```sql
CREATE INDEX idx_ak_mangas_titre_trgm ON ak_mangas USING gin (titre gin_trgm_ops);
CREATE INDEX idx_ak_mangas_titre_orig_trgm ON ak_mangas USING gin (titre_orig gin_trgm_ops);
CREATE INDEX idx_ak_mangas_titre_fr_trgm ON ak_mangas USING gin (titre_fr gin_trgm_ops);
```

## API Response Format

### Before (AniList):
```json
{
  "isbn": "9782756098593",
  "bookInfo": { ... },
  "anilistResults": [
    {
      "id": 30013,
      "title": { "romaji": "One Piece", "english": "One Piece" },
      "coverImage": { "large": "..." },
      "volumes": 100,
      "chapters": 1000,
      "genres": ["Action", "Adventure"]
    }
  ]
}
```

### After (Local DB):
```json
{
  "isbn": "9782756098593",
  "bookInfo": { ... },
  "mangaResults": [
    {
      "id": 123,
      "title": "One Piece",
      "author": "Eiichiro Oda",
      "image": "/api/media/serve/manga/onepiece.jpg",
      "year": "2013",
      "volumes": "100+",
      "synopsis": "...",
      "origin": "Japon",
      "publisher": "Glénat",
      "niceUrl": "one-piece",
      "rating": 9.2,
      "similarityScore": 95
    }
  ],
  "message": "Found 5 matching manga in local database."
}
```

## Testing

### Test ISBNs (French Editions):

- **One Piece Tome 1**: `9782756098593`
- **Vinland Saga (1)**: `9782351423554`
- **Naruto Vol. 1**: `9781421536255`
- **Attack on Titan Vol. 1**: `9781612620244`

### Expected Behavior:

1. Scan ISBN barcode with camera
2. OpenLibrary returns book metadata (title, author, publisher)
3. Title is cleaned (removes "Tome 1", "Vol. 1", etc.)
4. PostgreSQL searches `ak_mangas` for similar titles
5. Results shown with similarity scores
6. User selects best match

### Similarity Scoring Guide:

- **90-100%**: Exact or near-exact match
- **70-89%**: Very good match (likely correct)
- **50-69%**: Moderate match (verify manually)
- **30-49%**: Weak match (may not be correct)

## Benefits

✅ **Better French Support**: Matches French editions from local database
✅ **No External API Dependency**: Works offline once book metadata is fetched
✅ **Faster Results**: No network latency to AniList
✅ **More Accurate**: Matches against actual database entries
✅ **Transparency**: Shows similarity score so users can judge confidence
✅ **Flexible Matching**: Searches multiple title fields (original, French, alternative)

## Migration Notes

- **No breaking changes** to API endpoint (`GET /api/mangas/isbn/lookup`)
- Frontend automatically uses new `mangaResults` field
- OpenLibrary integration remains unchanged
- ISBN validation and cleaning logic unchanged

## Future Improvements

Potential enhancements:

1. **Author matching**: Boost similarity score if authors match
2. **Publisher matching**: Consider publisher in relevance scoring
3. **Year filtering**: Narrow results by publication year
4. **Fuzzy year matching**: ±2 years tolerance
5. **Manual override**: Allow users to manually link ISBN to manga
6. **ISBN storage**: Store ISBN in `ak_mangas` for direct lookup
7. **Learning system**: Track user selections to improve future matches

## Troubleshooting

### "Function SIMILARITY does not exist"

**Problem**: PostgreSQL `pg_trgm` extension not enabled

**Solution**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### No results found

**Possible causes**:
1. Title mismatch too severe (try adjusting threshold from 0.3 to 0.2)
2. Manga not in `ak_mangas` database
3. `statut != 1` (manga not published)

**Debug**:
- Check console logs for cleaned title
- Manually search database for similar titles
- Verify manga exists with `statut = 1`

### Slow performance

**Solution**: Add GIN indexes (see Performance Optimization section above)

## Files Modified

- `/src/modules/mangas/mangas.service.ts` - Updated `lookupByIsbn()` method
- `/frontendv2/components/BarcodeScannerV2.vue` - Updated UI for local results
- `enable-pg-trgm.sql` - Database migration script (new file)
