-- Add Performance Indexes to Optimize Query Performance
-- This migration adds critical indexes to frequently queried tables
-- Expected impact: 50-80% reduction in query time for collection and content lookups

-- Collection Anime indexes (user collections are heavily queried)
CREATE INDEX IF NOT EXISTS "collection_animes_id_membre_idx" ON "collection_animes"("id_membre");
CREATE INDEX IF NOT EXISTS "collection_animes_id_anime_idx" ON "collection_animes"("id_anime");
CREATE INDEX IF NOT EXISTS "collection_animes_id_membre_id_anime_idx" ON "collection_animes"("id_membre", "id_anime");
CREATE INDEX IF NOT EXISTS "collection_animes_id_membre_type_idx" ON "collection_animes"("id_membre", "type");
CREATE INDEX IF NOT EXISTS "collection_animes_created_at_idx" ON "collection_animes"("created_at");

-- Collection Manga indexes
CREATE INDEX IF NOT EXISTS "collection_mangas_id_membre_idx" ON "collection_mangas"("id_membre");
CREATE INDEX IF NOT EXISTS "collection_mangas_id_manga_idx" ON "collection_mangas"("id_manga");
CREATE INDEX IF NOT EXISTS "collection_mangas_id_membre_id_manga_idx" ON "collection_mangas"("id_membre", "id_manga");
CREATE INDEX IF NOT EXISTS "collection_mangas_id_membre_type_idx" ON "collection_mangas"("id_membre", "type");
CREATE INDEX IF NOT EXISTS "collection_mangas_created_at_idx" ON "collection_mangas"("created_at");

-- Anime indexes (for filtering and searching)
CREATE INDEX IF NOT EXISTS "ak_animes_statut_idx" ON "ak_animes"("statut");
CREATE INDEX IF NOT EXISTS "ak_animes_date_ajout_idx" ON "ak_animes"("date_ajout");
CREATE INDEX IF NOT EXISTS "ak_animes_licence_idx" ON "ak_animes"("licence");
CREATE INDEX IF NOT EXISTS "ak_animes_nice_url_idx" ON "ak_animes"("nice_url");

-- Manga indexes
CREATE INDEX IF NOT EXISTS "ak_mangas_statut_idx" ON "ak_mangas"("statut");
CREATE INDEX IF NOT EXISTS "ak_mangas_date_ajout_idx" ON "ak_mangas"("date_ajout");
CREATE INDEX IF NOT EXISTS "ak_mangas_licence_idx" ON "ak_mangas"("licence");
CREATE INDEX IF NOT EXISTS "ak_mangas_nice_url_idx" ON "ak_mangas"("nice_url");

-- Episode indexes (for anime episode lookups)
CREATE INDEX IF NOT EXISTS "ak_animes_episodes_id_anime_idx" ON "ak_animes_episodes"("id_anime");
CREATE INDEX IF NOT EXISTS "ak_animes_episodes_id_anime_numero_idx" ON "ak_animes_episodes"("id_anime", "numero");

-- Trailer indexes
CREATE INDEX IF NOT EXISTS "ak_animes_trailers_id_anime_idx" ON "ak_animes_trailers"("id_anime");
CREATE INDEX IF NOT EXISTS "ak_animes_trailers_statut_idx" ON "ak_animes_trailers"("statut");

-- Review/Critique indexes (for user reviews and content reviews)
CREATE INDEX IF NOT EXISTS "ak_critique_id_membre_idx" ON "ak_critique"("id_membre");
CREATE INDEX IF NOT EXISTS "ak_critique_id_anime_idx" ON "ak_critique"("id_anime");
CREATE INDEX IF NOT EXISTS "ak_critique_id_manga_idx" ON "ak_critique"("id_manga");
CREATE INDEX IF NOT EXISTS "ak_critique_statut_idx" ON "ak_critique"("statut");
CREATE INDEX IF NOT EXISTS "ak_critique_date_critique_idx" ON "ak_critique"("date_critique");
