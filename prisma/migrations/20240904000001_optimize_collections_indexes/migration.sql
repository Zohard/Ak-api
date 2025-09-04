-- CreateIndex
-- Optimize collection queries by adding compound indexes on member ID and type
CREATE INDEX IF NOT EXISTS "CollectionAnime_idMembre_type_idx" ON "CollectionAnime"("idMembre", "type");
CREATE INDEX IF NOT EXISTS "CollectionManga_idMembre_type_idx" ON "CollectionManga"("idMembre", "type");

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS "CollectionAnime_idMembre_createdAt_idx" ON "CollectionAnime"("idMembre", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CollectionManga_idMembre_createdAt_idx" ON "CollectionManga"("idMembre", "createdAt" DESC);

-- Indexes for public collections browsing
CREATE INDEX IF NOT EXISTS "CollectionAnime_isPublic_type_idx" ON "CollectionAnime"("isPublic", "type") WHERE "isPublic" = true;
CREATE INDEX IF NOT EXISTS "CollectionManga_isPublic_type_idx" ON "CollectionManga"("isPublic", "type") WHERE "isPublic" = true;