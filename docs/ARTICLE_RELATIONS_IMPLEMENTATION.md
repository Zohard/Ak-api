# Article Relations Implementation Guide

## Overview

The article relations system allows linking **webzine articles** to **anime/manga/business** entries. This creates a many-to-many relationship where:
- One anime/manga/business can have multiple related articles
- One article can be related to multiple anime/manga/business entries

## Database Schema

### Main Table: `ak_webzine_to_fiches`

```sql
CREATE TABLE ak_webzine_to_fiches (
    id_relation   SERIAL PRIMARY KEY,
    id_article    INTEGER NOT NULL,      -- Old webzine article ID (ak_webzine_articles.id_art)
    id_wp_article INTEGER NOT NULL,      -- WordPress article ID (wp_posts.ID)
    id_fiche      INTEGER NOT NULL,      -- Anime/Manga/Business ID
    type          VARCHAR(255)           -- 'anime', 'manga', 'business'
);
```

### Current Data Status

```bash
# Existing relations in database:
- 72 anime relations
- 340 manga relations
- 178 null type (needs cleanup)
- 2 unknown type
```

### Related Tables

**1. WordPress Articles** (`wp_posts`)
- Modern WordPress-based webzine articles
- Used via `id_wp_article` field

**2. Legacy Articles** (`ak_webzine_articles`)
- Old article system
- Still referenced via `id_article` field
- Columns: id_art, titre, nice_url, date, img, texte, auteur, statut, etc.

## How Old System Works

### Adding a Relation (Old PHP Code)

```php
// File: /__zone-admin__/ajax/f2f_ajout_article.php

// 1. Check for duplicates
SELECT id_relation
FROM ak_webzine_to_fiches
WHERE id_fiche = "$id_fiche_master"
  AND id_wp_article = "$id_article_to_rel"
  AND type = "anime"

// 2. Insert new relation if not exists
INSERT INTO ak_webzine_to_fiches
(id_article, id_wp_article, id_fiche, type)
VALUES (0, '$id_article_to_rel', '$id_fiche_master', 'anime')

// 3. Update anime modification date
UPDATE ak_animes
SET date_modification = "current_timestamp"
WHERE id_anime = "$id_fiche_master"
```

### Displaying Relations

```php
// Get relations for an anime
SELECT wp.*, a2f.*
FROM wp_posts wp
INNER JOIN ak_webzine_to_fiches a2f ON a2f.id_wp_article = wp.ID
WHERE a2f.id_fiche = '4103'
  AND a2f.type = 'anime'
  AND wp.post_status = 'publish'
ORDER BY wp.post_date DESC
```

## NestJS Implementation

### 1. Prisma Schema Addition

Add to `prisma/schema.prisma`:

```prisma
model WebzineToFiches {
  id_relation   Int     @id @default(autoincrement())
  id_article    Int     @default(0)
  id_wp_article Int     @default(0)
  id_fiche      Int
  type          String? @db.VarChar(255)

  // Relations
  anime    Anime?   @relation(fields: [id_fiche], references: [id_anime])
  manga    Manga?   @relation(fields: [id_fiche], references: [id_manga])
  business Business? @relation(fields: [id_fiche], references: [ID_BUSINESS])

  wpPost   WpPost?  @relation(fields: [id_wp_article], references: [ID])

  @@map("ak_webzine_to_fiches")
  @@index([id_fiche, type])
  @@index([id_wp_article])
}

// Add to Anime model
model Anime {
  // ... existing fields
  articleRelations WebzineToFiches[]
}

// Add to Manga model
model Manga {
  // ... existing fields
  articleRelations WebzineToFiches[]
}

// Add to Business model
model Business {
  // ... existing fields
  articleRelations WebzineToFiches[]
}
```

### 2. DTOs

Create `src/modules/article-relations/dto/article-relation.dto.ts`:

```typescript
import { IsInt, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateArticleRelationDto {
  @ApiProperty({ description: 'Anime/Manga/Business ID' })
  @IsInt()
  @IsNotEmpty()
  id_fiche: number;

  @ApiProperty({ description: 'WordPress article ID' })
  @IsInt()
  @IsNotEmpty()
  id_wp_article: number;

  @ApiProperty({ description: 'Type of relation', enum: ['anime', 'manga', 'business'] })
  @IsIn(['anime', 'manga', 'business'])
  @IsNotEmpty()
  type: 'anime' | 'manga' | 'business';
}

export class DeleteArticleRelationDto {
  @ApiProperty({ description: 'Relation ID to delete' })
  @IsInt()
  @IsNotEmpty()
  id_relation: number;
}
```

### 3. Service

Create `src/modules/article-relations/article-relations.service.ts`:

```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateArticleRelationDto } from './dto/article-relation.dto';

@Injectable()
export class ArticleRelationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all articles related to an anime/manga/business
   */
  async getRelations(id_fiche: number, type: 'anime' | 'manga' | 'business') {
    const relations = await this.prisma.webzineToFiches.findMany({
      where: {
        id_fiche,
        type,
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            post_title: true,
            post_name: true,
            post_date: true,
            post_excerpt: true,
            post_status: true,
          },
        },
      },
      orderBy: {
        wpPost: {
          post_date: 'desc',
        },
      },
    });

    return relations
      .filter(rel => rel.wpPost?.post_status === 'publish')
      .map(rel => ({
        id_relation: rel.id_relation,
        article: {
          id: rel.wpPost.ID,
          title: rel.wpPost.post_title,
          slug: rel.wpPost.post_name,
          date: rel.wpPost.post_date,
          excerpt: rel.wpPost.post_excerpt,
        },
      }));
  }

  /**
   * Add a new article relation
   */
  async createRelation(dto: CreateArticleRelationDto) {
    // Check for duplicate
    const existing = await this.prisma.webzineToFiches.findFirst({
      where: {
        id_fiche: dto.id_fiche,
        id_wp_article: dto.id_wp_article,
        type: dto.type,
      },
    });

    if (existing) {
      throw new ConflictException('Cette relation existe déjà');
    }

    // Create relation
    const relation = await this.prisma.webzineToFiches.create({
      data: {
        id_fiche: dto.id_fiche,
        id_wp_article: dto.id_wp_article,
        id_article: 0, // Legacy field, set to 0 for new WordPress-only relations
        type: dto.type,
      },
      include: {
        wpPost: true,
      },
    });

    // Update modification date based on type
    if (dto.type === 'anime') {
      await this.prisma.anime.update({
        where: { id_anime: dto.id_fiche },
        data: { date_modification: new Date() },
      });
    } else if (dto.type === 'manga') {
      await this.prisma.manga.update({
        where: { id_manga: dto.id_fiche },
        data: { date_modification: new Date() },
      });
    }

    return relation;
  }

  /**
   * Remove an article relation
   */
  async deleteRelation(id_relation: number, type: 'anime' | 'manga' | 'business') {
    const relation = await this.prisma.webzineToFiches.findUnique({
      where: { id_relation },
    });

    if (!relation) {
      throw new NotFoundException('Relation introuvable');
    }

    await this.prisma.webzineToFiches.delete({
      where: { id_relation },
    });

    // Update modification date
    if (type === 'anime') {
      await this.prisma.anime.update({
        where: { id_anime: relation.id_fiche },
        data: { date_modification: new Date() },
      });
    } else if (type === 'manga') {
      await this.prisma.manga.update({
        where: { id_manga: relation.id_fiche },
        data: { date_modification: new Date() },
      });
    }

    return { message: 'Relation supprimée' };
  }
}
```

### 4. Controller

Create `src/modules/article-relations/article-relations.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ArticleRelationsService } from './article-relations.service';
import { CreateArticleRelationDto } from './dto/article-relation.dto';

@ApiTags('Article Relations')
@Controller('article-relations')
export class ArticleRelationsController {
  constructor(private readonly service: ArticleRelationsService) {}

  @Get('anime/:id')
  @ApiOperation({ summary: 'Get articles related to an anime' })
  getAnimeArticles(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRelations(id, 'anime');
  }

  @Get('manga/:id')
  @ApiOperation({ summary: 'Get articles related to a manga' })
  getMangaArticles(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRelations(id, 'manga');
  }

  @Get('business/:id')
  @ApiOperation({ summary: 'Get articles related to a business entry' })
  getBusinessArticles(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRelations(id, 'business');
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add article relation (admin only)' })
  create(@Body() dto: CreateArticleRelationDto) {
    return this.service.createRelation(dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete article relation (admin only)' })
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: 'anime' | 'manga' | 'business',
  ) {
    return this.service.deleteRelation(id, type);
  }
}
```

### 5. Module

Create `src/modules/article-relations/article-relations.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ArticleRelationsController } from './article-relations.controller';
import { ArticleRelationsService } from './article-relations.service';

@Module({
  controllers: [ArticleRelationsController],
  providers: [ArticleRelationsService],
  exports: [ArticleRelationsService],
})
export class ArticleRelationsModule {}
```

## Frontend Implementation (Nuxt/Vue)

### 1. Composable

Create `composables/useArticleRelations.ts`:

```typescript
export const useArticleRelations = () => {
  const config = useRuntimeConfig();

  const getAnimeArticles = async (animeId: number) => {
    const { data, error } = await useFetch(
      `${config.public.apiBase}/article-relations/anime/${animeId}`
    );
    return { data, error };
  };

  const getMangaArticles = async (mangaId: number) => {
    const { data, error } = await useFetch(
      `${config.public.apiBase}/article-relations/manga/${mangaId}`
    );
    return { data, error };
  };

  const addArticleRelation = async (
    id_fiche: number,
    id_wp_article: number,
    type: 'anime' | 'manga' | 'business'
  ) => {
    const token = useCookie('auth_token');
    const { data, error } = await $fetch(
      `${config.public.apiBase}/article-relations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
        body: { id_fiche, id_wp_article, type },
      }
    );
    return { data, error };
  };

  const deleteArticleRelation = async (
    id_relation: number,
    type: 'anime' | 'manga' | 'business'
  ) => {
    const token = useCookie('auth_token');
    const { data, error } = await $fetch(
      `${config.public.apiBase}/article-relations/${id_relation}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
        body: { type },
      }
    );
    return { data, error };
  };

  return {
    getAnimeArticles,
    getMangaArticles,
    addArticleRelation,
    deleteArticleRelation,
  };
};
```

### 2. Admin Component

Create `components/admin/ArticleRelationsManager.vue`:

```vue
<template>
  <div class="article-relations-manager">
    <h3 class="text-lg font-semibold mb-4">
      Relations avec des articles du webzine
    </h3>

    <!-- Existing Relations -->
    <div v-if="relations.length > 0" class="mb-6">
      <h4 class="font-medium mb-2">Articles liés :</h4>
      <ul class="space-y-2">
        <li
          v-for="rel in relations"
          :key="rel.id_relation"
          class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
        >
          <div class="flex-1">
            <span class="font-medium">{{ rel.article.title }}</span>
            <span class="text-sm text-gray-500 ml-2">
              #{{ rel.article.id }}
            </span>
            <span class="text-xs text-gray-400 ml-2">
              {{ formatDate(rel.article.date) }}
            </span>
          </div>
          <button
            @click="removeRelation(rel.id_relation)"
            class="text-red-600 hover:text-red-800 text-sm"
          >
            Supprimer
          </button>
        </li>
      </ul>
    </div>
    <div v-else class="text-gray-500 mb-6">Aucun article lié</div>

    <!-- Add New Relation -->
    <div class="border-t pt-4">
      <h4 class="font-medium mb-2">Ajouter une relation :</h4>
      <div class="flex gap-2">
        <input
          v-model="newArticleId"
          type="number"
          placeholder="ID article WordPress"
          class="flex-1 px-3 py-2 border rounded"
        />
        <button
          @click="addRelation"
          :disabled="!newArticleId || isLoading"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  ficheId: number;
  type: 'anime' | 'manga' | 'business';
}>();

const { getAnimeArticles, getMangaArticles, addArticleRelation, deleteArticleRelation } = useArticleRelations();

const relations = ref([]);
const newArticleId = ref('');
const isLoading = ref(false);

const loadRelations = async () => {
  const { data } = props.type === 'anime'
    ? await getAnimeArticles(props.ficheId)
    : await getMangaArticles(props.ficheId);

  if (data.value) {
    relations.value = data.value;
  }
};

const addRelation = async () => {
  if (!newArticleId.value) return;

  isLoading.value = true;
  try {
    await addArticleRelation(props.ficheId, parseInt(newArticleId.value), props.type);
    newArticleId.value = '';
    await loadRelations();
  } catch (error) {
    console.error('Error adding relation:', error);
    alert('Erreur lors de l\'ajout de la relation');
  } finally {
    isLoading.value = false;
  }
};

const removeRelation = async (id_relation: number) => {
  if (!confirm('Supprimer cette relation ?')) return;

  try {
    await deleteArticleRelation(id_relation, props.type);
    await loadRelations();
  } catch (error) {
    console.error('Error removing relation:', error);
    alert('Erreur lors de la suppression');
  }
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('fr-FR');
};

onMounted(() => {
  loadRelations();
});
</script>
```

## API Endpoints Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/article-relations/anime/:id` | Get articles for anime | Public |
| GET | `/article-relations/manga/:id` | Get articles for manga | Public |
| GET | `/article-relations/business/:id` | Get articles for business | Public |
| POST | `/article-relations` | Add new relation | Admin |
| DELETE | `/article-relations/:id` | Remove relation | Admin |

## Database Cleanup Needed

```sql
-- Add missing indexes for performance
CREATE INDEX idx_webzine_to_fiches_lookup ON ak_webzine_to_fiches(id_fiche, type);
CREATE INDEX idx_webzine_to_fiches_wp ON ak_webzine_to_fiches(id_wp_article);

-- Clean up null types (optional)
UPDATE ak_webzine_to_fiches SET type = 'unknown' WHERE type IS NULL OR type = '';

-- Add foreign key constraints (optional, for data integrity)
ALTER TABLE ak_webzine_to_fiches
  ADD CONSTRAINT fk_wp_article
  FOREIGN KEY (id_wp_article) REFERENCES wp_posts(ID) ON DELETE CASCADE;
```

## Testing

```bash
# Get anime articles
curl http://localhost:3002/api/article-relations/anime/4103

# Add relation (requires admin auth)
curl -X POST http://localhost:3002/api/article-relations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id_fiche": 4103, "id_wp_article": 377, "type": "anime"}'

# Delete relation
curl -X DELETE http://localhost:3002/api/article-relations/133 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "anime"}'
```

## Migration Status

✅ Database table exists and has data
✅ 412 relations already migrated (72 anime + 340 manga)
⚠️ ~178 records need type cleanup
⚠️ Missing indexes for optimal performance
❌ NestJS service not yet implemented
❌ Frontend component not yet implemented

## Next Steps

1. **Create Prisma schema** for `WebzineToFiches` model
2. **Implement NestJS service** following the template above
3. **Create admin UI component** for managing relations
4. **Add indexes** to database for better performance
5. **Clean up null types** in existing data
6. **Test with existing data** (anime ID 4103, manga ID 29)
