# ImageKit Filename Helper Usage Guide

## Overview

The `ImageKitService` now provides helper methods to create safe, SEO-friendly filenames using **title + timestamp**.

## Features

✅ **Human-readable filenames** - `one-piece-1702345678901.jpg` instead of random IDs
✅ **SEO-friendly URLs** - Better for search engines
✅ **Automatic sanitization** - Handles accented characters, special chars, spaces
✅ **Timestamp uniqueness** - Prevents filename conflicts
✅ **Organized folders** - Separate folders for each media type

## Usage

### Basic Usage

```typescript
import { ImageKitService } from './modules/media/imagekit.service';

class YourService {
  constructor(private imageKitService: ImageKitService) {}

  async uploadImage(title: string, imageUrl: string, mediaType: 'anime' | 'manga' | 'jeu-video' | 'business' | 'article') {
    // Generate safe filename
    const filename = this.imageKitService.createSafeFileName(title, mediaType);

    // Get correct folder for media type
    const folder = this.imageKitService.getFolderForMediaType(mediaType);

    // Upload to ImageKit
    const result = await this.imageKitService.uploadImageFromUrl(
      imageUrl,
      filename,
      folder
    );

    return result;
  }
}
```

### Examples

#### Anime Upload
```typescript
const filename = this.imageKitService.createSafeFileName('One Piece', 'anime');
// Result: "one-piece-1702345678901"

const folder = this.imageKitService.getFolderForMediaType('anime');
// Result: "images/animes"

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, folder);
```

#### Manga Upload
```typescript
const filename = this.imageKitService.createSafeFileName('Naruto Shippūden', 'manga');
// Result: "naruto-shippuden-1702345678902"

const folder = this.imageKitService.getFolderForMediaType('manga');
// Result: "images/mangas"

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, folder);
```

#### Jeux Vidéo Upload
```typescript
const filename = this.imageKitService.createSafeFileName('Final Fantasy VII', 'jeu-video');
// Result: "final-fantasy-vii-1702345678903"

const folder = this.imageKitService.getFolderForMediaType('jeu-video');
// Result: "images/jeux-video"

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, folder);
```

#### Business Upload
```typescript
const filename = this.imageKitService.createSafeFileName('Café René', 'business');
// Result: "cafe-rene-1702345678904"

const folder = this.imageKitService.getFolderForMediaType('business');
// Result: "images/business"

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, folder);
```

#### Article Upload
```typescript
const filename = this.imageKitService.createSafeFileName('Top 10 Anime 2024', 'article');
// Result: "top-10-anime-2024-1702345678905"

const folder = this.imageKitService.getFolderForMediaType('article');
// Result: "images/articles"

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, folder);
```

## API Reference

### `createSafeFileName(title: string, mediaType?: MediaType): string`

Creates a sanitized filename from a title with timestamp.

**Parameters:**
- `title` - The title to sanitize (e.g., anime name, manga name)
- `mediaType` - Optional media type ('anime' | 'manga' | 'jeu-video' | 'business' | 'article')

**Returns:** Sanitized filename without extension

**Sanitization process:**
1. Converts to lowercase
2. Normalizes accented characters (é → e, ü → u)
3. Removes diacritics and special characters
4. Replaces spaces with hyphens
5. Limits length to 50 characters
6. Adds timestamp for uniqueness

### `getFolderForMediaType(mediaType: MediaType): string`

Gets the ImageKit folder path for a specific media type.

**Parameters:**
- `mediaType` - Media type ('anime' | 'manga' | 'jeu-video' | 'business' | 'article')

**Returns:** Folder path (e.g., 'images/animes')

### `ImageKitService.FOLDERS`

Static constant with folder structure:

```typescript
{
  anime: 'images/animes',
  manga: 'images/mangas',
  'jeu-video': 'images/jeux-video',
  business: 'images/business',
  article: 'images/articles'
}
```

## Character Handling Examples

| Input Title | Sanitized Output |
|-------------|------------------|
| `One Piece` | `one-piece-{timestamp}` |
| `Naruto Shippūden` | `naruto-shippuden-{timestamp}` |
| `Café René` | `cafe-rene-{timestamp}` |
| `L'Attaque des Titans` | `lattaque-des-titans-{timestamp}` |
| `Final Fantasy VII: Remake` | `final-fantasy-vii-remake-{timestamp}` |
| `ソードアート・オンライン` | `{mediaType}-{timestamp}` (falls back if no valid chars) |

## Migration from Manual Sanitization

**Before:**
```typescript
const cleanTitle = title
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '')
  .substring(0, 50);

const timestamp = Date.now();
const filename = `${cleanTitle}-${timestamp}`;

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, 'images/animes');
```

**After:**
```typescript
const filename = this.imageKitService.createSafeFileName(title, 'anime');
const folder = this.imageKitService.getFolderForMediaType('anime');

await this.imageKitService.uploadImageFromUrl(imageUrl, filename, folder);
```

## Best Practices

1. **Always use the helper** - Don't manually sanitize titles
2. **Use mediaType parameter** - Helps with debugging and fallback filenames
3. **Don't add file extensions** - The upload method handles this automatically
4. **Check for empty titles** - The helper handles this, but validate input
5. **Use getFolderForMediaType** - Ensures consistent folder structure

## Files Already Updated

- ✅ `src/modules/admin/content/admin-mangas.service.ts`
- ✅ `src/modules/admin/content/admin-business.service.ts`

## Files to Update

- ⏳ `src/modules/admin/content/sources-externes.service.ts` (line 242)
- ⏳ `src/modules/admin/content/admin-jeux-video.service.ts` (line 442)
- ⏳ Any other services that manually sanitize titles

## Testing

```typescript
// Test with various titles
const tests = [
  'One Piece',
  'Naruto Shippūden',
  'Café René',
  'L\'Attaque des Titans',
  'Final Fantasy VII: Remake',
  '',  // Empty title - should fallback to 'anime-{timestamp}'
];

tests.forEach(title => {
  const filename = imageKitService.createSafeFileName(title, 'anime');
  console.log(`${title} → ${filename}`);
});
```
