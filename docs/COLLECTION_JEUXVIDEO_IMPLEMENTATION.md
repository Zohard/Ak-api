# Video Game Collection Feature Implementation Plan

## ✅ Completed

### 1. Database Model (Prisma Schema)
- ✅ Created `CollectionJeuxVideo` model in `prisma/schema.prisma`
- ✅ Added relations to `SmfMember` and `AkJeuxVideo`
- ✅ Generated Prisma client
- ✅ Committed to repository

### 2. DTOs
- ✅ Created `add-jeuxvideo-to-collection.dto.ts` with all fields
- ✅ Created `update-jeuxvideo-collection.dto.ts`

## 📋 Remaining Implementation

### 3. Service Methods (collections.service.ts)
Add the following methods after the `addMangaToCollection` method (around line 1850):

```typescript
// Video Game Collection Methods
async addJeuxVideoToCollection(userId: number, type: number, dto: AddJeuxVideoToCollectionDto, currentUserId: number) {
  // Check authorization
  if (userId !== currentUserId) {
    throw new ForbiddenException('You can only modify your own collection');
  }

  // Check if game exists
  const game = await this.prisma.akJeuxVideo.findUnique({
    where: { idJeu: dto.gameId }
  });
  if (!game) {
    throw new NotFoundException('Game not found');
  }

  // Check for existing entry
  const existing = await this.prisma.collectionJeuxVideo.findFirst({
    where: {
      idMembre: userId,
      idJeu: dto.gameId,
      type
    }
  });

  if (existing) {
    throw new ConflictException('Game already in this collection type');
  }

  // Create collection entry
  const collection = await this.prisma.collectionJeuxVideo.create({
    data: {
      idMembre: userId,
      idJeu: dto.gameId,
      type,
      evaluation: dto.rating || 0,
      notes: dto.notes,
      platformPlayed: dto.platformPlayed,
      physicalPlatform: dto.physicalPlatform,
      startedDate: dto.startedDate ? new Date(dto.startedDate) : null,
      finishedDate: dto.finishedDate ? new Date(dto.finishedDate) : null,
      liked: dto.liked ?? false,
      mastered: dto.mastered ?? false,
      isReplay: dto.isReplay ?? false,
      logTitle: dto.logTitle || 'Log',
      timePlayedHours: dto.timePlayedHours || 0,
      timePlayedMinutes: dto.timePlayedMinutes || 0,
      ownershipType: dto.ownershipType,
      storefront: dto.storefront,
      containsSpoilers: dto.containsSpoilers ?? false,
    },
    include: {
      jeuxVideo: true
    }
  });

  // Invalidate cache
  await this.cacheService.del(`user_collections:v2:${userId}:*`);

  return collection;
}

async updateJeuxVideoInCollection(userId: number, collectionId: number, dto: UpdateJeuxVideoCollectionDto, currentUserId: number) {
  // Check authorization
  if (userId !== currentUserId) {
    throw new ForbiddenException('You can only modify your own collection');
  }

  // Check if entry exists and belongs to user
  const existing = await this.prisma.collectionJeuxVideo.findUnique({
    where: { idCollection: collectionId }
  });

  if (!existing) {
    throw new NotFoundException('Collection entry not found');
  }

  if (existing.idMembre !== userId) {
    throw new ForbiddenException('This collection entry does not belong to you');
  }

  // Update
  const updated = await this.prisma.collectionJeuxVideo.update({
    where: { idCollection: collectionId },
    data: {
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.rating !== undefined && { evaluation: dto.rating }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.platformPlayed !== undefined && { platformPlayed: dto.platformPlayed }),
      ...(dto.physicalPlatform !== undefined && { physicalPlatform: dto.physicalPlatform }),
      ...(dto.startedDate !== undefined && { startedDate: dto.startedDate ? new Date(dto.startedDate) : null }),
      ...(dto.finishedDate !== undefined && { finishedDate: dto.finishedDate ? new Date(dto.finishedDate) : null }),
      ...(dto.liked !== undefined && { liked: dto.liked }),
      ...(dto.mastered !== undefined && { mastered: dto.mastered }),
      ...(dto.isReplay !== undefined && { isReplay: dto.isReplay }),
      ...(dto.logTitle !== undefined && { logTitle: dto.logTitle }),
      ...(dto.timePlayedHours !== undefined && { timePlayedHours: dto.timePlayedHours }),
      ...(dto.timePlayedMinutes !== undefined && { timePlayedMinutes: dto.timePlayedMinutes }),
      ...(dto.ownershipType !== undefined && { ownershipType: dto.ownershipType }),
      ...(dto.storefront !== undefined && { storefront: dto.storefront }),
      ...(dto.containsSpoilers !== undefined && { containsSpoilers: dto.containsSpoilers }),
      dateModified: new Date()
    },
    include: {
      jeuxVideo: true
    }
  });

  // Invalidate cache
  await this.cacheService.del(`user_collections:v2:${userId}:*`);

  return updated;
}

async removeJeuxVideoFromCollection(userId: number, collectionId: number, currentUserId: number) {
  // Check authorization
  if (userId !== currentUserId) {
    throw new ForbiddenException('You can only modify your own collection');
  }

  // Check if entry exists and belongs to user
  const existing = await this.prisma.collectionJeuxVideo.findUnique({
    where: { idCollection: collectionId }
  });

  if (!existing) {
    throw new NotFoundException('Collection entry not found');
  }

  if (existing.idMembre !== userId) {
    throw new ForbiddenException('This collection entry does not belong to you');
  }

  // Delete
  await this.prisma.collectionJeuxVideo.delete({
    where: { idCollection: collectionId }
  });

  // Invalidate cache
  await this.cacheService.del(`user_collections:v2:${userId}:*`);

  return { message: 'Game removed from collection' };
}

async getJeuxVideoCollection(userId: number, type?: number, currentUserId?: number) {
  const where: any = { idMembre: userId };
  if (type !== undefined) {
    where.type = type;
  }

  const collection = await this.prisma.collectionJeuxVideo.findMany({
    where,
    include: {
      jeuxVideo: {
        include: {
          platforms: {
            include: {
              platform: true
            }
          },
          genres: {
            include: {
              genre: true
            }
          }
        }
      }
    },
    orderBy: { dateCreated: 'desc' }
  });

  return collection;
}
```

### 4. Controller Endpoints (collections.controller.ts)
Add after the manga collection endpoints:

```typescript
// Video Game Collection Endpoints
@Post('users/:userId/jeuxvideo/:type')
@ApiOperation({ summary: 'Add a video game to user collection' })
@ApiParam({ name: 'userId', type: 'number' })
@ApiParam({ name: 'type', type: 'number', description: '1=Terminé, 2=En cours, 3=Planifié, 4=Abandonné, 5=En pause' })
addJeuxVideoToCollection(
  @Request() req,
  @Param('userId', ParseIntPipe) userId: number,
  @Param('type', ParseIntPipe) type: number,
  @Body() dto: AddJeuxVideoToCollectionDto
) {
  const currentUserId = req.user?.id_member;
  return this.collectionsService.addJeuxVideoToCollection(userId, type, dto, currentUserId);
}

@Put('users/:userId/jeuxvideo/entry/:collectionId')
@ApiOperation({ summary: 'Update a video game collection entry' })
updateJeuxVideoInCollection(
  @Request() req,
  @Param('userId', ParseIntPipe) userId: number,
  @Param('collectionId', ParseIntPipe) collectionId: number,
  @Body() dto: UpdateJeuxVideoCollectionDto
) {
  const currentUserId = req.user?.id_member;
  return this.collectionsService.updateJeuxVideoInCollection(userId, collectionId, dto, currentUserId);
}

@Delete('users/:userId/jeuxvideo/entry/:collectionId')
@ApiOperation({ summary: 'Remove a video game from collection' })
removeJeuxVideoFromCollection(
  @Request() req,
  @Param('userId', ParseIntPipe) userId: number,
  @Param('collectionId', ParseIntPipe) collectionId: number
) {
  const currentUserId = req.user?.id_member;
  return this.collectionsService.removeJeuxVideoFromCollection(userId, collectionId, currentUserId);
}

@Get('users/:userId/jeuxvideo')
@ApiOperation({ summary: 'Get user video game collection' })
@ApiQuery({ name: 'type', required: false, type: 'number' })
getJeuxVideoCollection(
  @Request() req,
  @Param('userId', ParseIntPipe) userId: number,
  @Query('type') type?: number
) {
  const currentUserId = req.user?.id_member;
  return this.collectionsService.getJeuxVideoCollection(userId, type, currentUserId);
}
```

### 5. Import DTOs in Service/Controller
Add to imports:
```typescript
import { AddJeuxVideoToCollectionDto } from './dto/add-jeuxvideo-to-collection.dto';
import { UpdateJeuxVideoCollectionDto } from './dto/update-jeuxvideo-collection.dto';
```

### 6. Frontend Implementation
Create `/pages/profile/[username]/collection/jeuxvideo.vue` based on the anime collection page pattern.

## Testing Checklist
- [ ] Add video game to collection (all types)
- [ ] Update collection entry
- [ ] Remove from collection
- [ ] View collection by type
- [ ] Permission checks (can't modify others' collections)
- [ ] Duplicate prevention

## API Endpoints
- `POST /api/collections/users/:userId/jeuxvideo/:type` - Add game
- `PUT /api/collections/users/:userId/jeuxvideo/entry/:collectionId` - Update entry
- `DELETE /api/collections/users/:userId/jeuxvideo/entry/:collectionId` - Remove game
- `GET /api/collections/users/:userId/jeuxvideo?type=X` - Get collection
