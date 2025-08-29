# Phase 8.1 Implementation Guide - Articles System Foundation

## Database Schema Integration

### Step 1: Update Prisma Schema

Add these models to your `prisma/schema.prisma`:

```prisma
// Articles System Models

model AkWebzineArticle {
  idArt            Int       @id @map("id_art")
  titre            String?   @db.Text
  niceUrl          String?   @map("nice_url") @db.VarChar(255)
  date             DateTime  @db.Timestamp
  img              String?   @db.VarChar(255)
  imgunebig        String?   @db.VarChar(255)
  imgunebig2       String?   @db.VarChar(255)
  texte            String?   @db.Text
  auteur           Int
  auteursMultiples String?   @map("auteurs_multiples") @db.Text
  metaDescription  String?   @map("meta_description") @db.Text
  tags             String?   @db.Text
  videos           String?   @db.Text
  nbCom            Int       @map("nb_com")
  nbClics          Int       @map("nb_clics")
  trackbacksOpen   Int       @map("trackbacks_open") @db.SmallInt @default(1)
  onindex          Int       @db.SmallInt @default(0)
  nl2br            Int       @db.SmallInt @default(1)
  alreadyPing      Int       @map("already_ping") @db.SmallInt
  statut           Int?      @db.SmallInt @default(0)

  // Relations
  author           SmfMember @relation(fields: [auteur], references: [idMember], onDelete: Cascade)
  categories       AkWebzineArt2Cat[]
  comments         AkWebzineComment[]
  images           AkWebzineImg[]
  contentRelations AkWebzineToFiche[]

  @@map("ak_webzine_articles")
}

model AkWebzineCategory {
  idCat    Int    @id @map("id_cat")
  niceUrl  String? @map("nice_url") @db.VarChar(255)
  nom      String? @db.VarChar(255)

  // Relations
  articles AkWebzineArt2Cat[]

  @@map("ak_webzine_categories")
}

model AkWebzineArt2Cat {
  idArt Int
  idCat Int?

  // Relations
  article  AkWebzineArticle  @relation(fields: [idArt], references: [idArt], onDelete: Cascade)
  category AkWebzineCategory? @relation(fields: [idCat], references: [idCat], onDelete: SetNull)

  @@id([idArt, idCat])
  @@map("ak_webzine_art2cat")
}

model AkWebzineComment {
  id          Int       @id
  date        DateTime  @db.Timestamp
  nom         String?   @db.VarChar(255)
  email       String?   @db.VarChar(255)
  website     String?   @db.VarChar(255)
  ip          String?   @db.VarChar(255)
  reverseip   String?   @db.VarChar(255)
  commentaire String?   @db.Text
  moderation  Int       @db.SmallInt
  idMembre    Int       @map("id_membre") @default(0)
  idArticle   Int?      @map("id_article") @default(0)

  // Relations
  member  SmfMember?        @relation(fields: [idMembre], references: [idMember], onDelete: Cascade)
  article AkWebzineArticle? @relation(fields: [idArticle], references: [idArt], onDelete: Cascade)

  @@map("ak_webzine_com")
}

model AkWebzineImg {
  idImg  Int    @id @map("id_img")
  idArt  Int    @map("id_art")
  urlImg String? @map("url_img") @db.VarChar(255)

  // Relations
  article AkWebzineArticle @relation(fields: [idArt], references: [idArt], onDelete: Cascade)

  @@map("ak_webzine_img")
}

model AkWebzineToFiche {
  idRelation  Int    @id @map("id_relation")
  idArticle   Int    @map("id_article")
  idWpArticle Int    @map("id_wp_article")
  idFiche     Int    @map("id_fiche")
  type        String? @db.VarChar(255)

  // Relations
  article AkWebzineArticle @relation(fields: [idArticle], references: [idArt], onDelete: Cascade)

  @@map("ak_webzine_to_fiches")
}
```

### Step 2: Update SmfMember Model

Add this relation to the existing SmfMember model:

```prisma
model SmfMember {
  // ... existing fields ...
  
  // Relations
  // ... existing relations ...
  articles         AkWebzineArticle[]
  articleComments  AkWebzineComment[]
}
```

## File Structure

```
src/modules/articles/
├── articles.controller.ts          # Public API endpoints
├── articles.service.ts             # Core business logic
├── articles.module.ts              # Module definition
├── categories/
│   ├── categories.controller.ts    # Categories management
│   ├── categories.service.ts       # Categories logic
│   └── dto/
│       ├── create-category.dto.ts
│       ├── update-category.dto.ts
│       └── category-query.dto.ts
├── comments/
│   ├── comments.controller.ts      # Comments management
│   ├── comments.service.ts         # Comments logic
│   └── dto/
│       ├── create-comment.dto.ts
│       ├── update-comment.dto.ts
│       └── moderate-comment.dto.ts
├── admin/
│   ├── admin-articles.controller.ts # Admin endpoints
│   ├── admin-articles.service.ts    # Admin business logic
│   └── dto/
│       └── admin-article-query.dto.ts
└── dto/
    ├── create-article.dto.ts
    ├── update-article.dto.ts
    ├── article-query.dto.ts
    ├── article-response.dto.ts
    └── publish-article.dto.ts
```

## Permission System

### Step 3: Create Article Permissions

```typescript
// src/modules/articles/decorators/article-permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ARTICLE_PERMISSIONS_KEY = 'article_permissions';
export const CanWriteArticles = () => SetMetadata(ARTICLE_PERMISSIONS_KEY, 'write');
export const CanEditArticles = () => SetMetadata(ARTICLE_PERMISSIONS_KEY, 'edit');
export const CanModerateComments = () => SetMetadata(ARTICLE_PERMISSIONS_KEY, 'moderate');
export const CanManageCategories = () => SetMetadata(ARTICLE_PERMISSIONS_KEY, 'manage');
```

### Step 4: Create Article Guards

```typescript
// src/modules/articles/guards/article-permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ARTICLE_PERMISSIONS_KEY } from '../decorators/article-permissions.decorator';

@Injectable()
export class ArticlePermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      ARTICLE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    // Check user roles for article permissions
    switch (requiredPermission) {
      case 'write':
        return user.isWriter || user.isEditor || user.isAdmin;
      case 'edit':
        return user.isEditor || user.isAdmin;
      case 'moderate':
        return user.isEditor || user.isAdmin;
      case 'manage':
        return user.isAdmin;
      default:
        return false;
    }
  }
}
```

## User Role System Extension

### Step 5: Extend User Roles

Add these columns to the `smf_members` table or create a separate roles table:

```sql
-- Option 1: Add to existing table
ALTER TABLE smf_members ADD COLUMN is_writer BOOLEAN DEFAULT FALSE;
ALTER TABLE smf_members ADD COLUMN is_editor BOOLEAN DEFAULT FALSE;

-- Option 2: Create separate roles table (recommended)
CREATE TABLE ak_user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES smf_members(id_member),
  role_name VARCHAR(50) NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by INTEGER REFERENCES smf_members(id_member)
);
```

## Next Steps - Phase 8.1 Implementation

1. **Update Prisma Schema** - Add webzine models
2. **Generate Prisma Client** - `npx prisma generate`
3. **Create Base Services** - Articles, Categories, Comments
4. **Implement DTOs** - Request/Response data structures
5. **Create Controllers** - Public and Admin endpoints
6. **Add Permission System** - Guards and decorators
7. **Write Unit Tests** - Service and controller tests

## API Endpoints Overview

### Public Endpoints
- `GET /api/articles` - List published articles
- `GET /api/articles/:id` - Get article details
- `GET /api/articles/category/:categoryId` - Articles by category
- `POST /api/articles/:id/comments` - Add comment (auth required)

### Admin Endpoints
- `GET /api/admin/articles` - List all articles (including drafts)
- `POST /api/admin/articles` - Create article (writer+)
- `PUT /api/admin/articles/:id` - Update article (author/editor+)
- `DELETE /api/admin/articles/:id` - Delete article (admin only)
- `PUT /api/admin/articles/:id/publish` - Publish article

This foundation will provide a solid base for the complete articles system with proper permissions, relationships, and extensibility for future features.