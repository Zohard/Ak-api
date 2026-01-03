-- Migration: Add Performance Indexes for CU Optimization
-- Created: 2026-01-03
-- Purpose: Reduce Neon PostgreSQL Compute Units by optimizing slow queries

-- ============================================================================
-- COLLECTION INDEXES (HIGH PRIORITY)
-- ============================================================================

-- Index for collection browsing queries (groupBy with member, type, and isPublic filter)
CREATE INDEX IF NOT EXISTS idx_collection_anime_member_type_public
ON collection_animes(id_membre, type, is_public)
WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_collection_manga_member_type_public
ON collection_mangas(id_membre, type, is_public)
WHERE is_public = true;

-- Index for collection existence checks (called on every page load for logged-in users)
CREATE INDEX IF NOT EXISTS idx_collection_anime_member_anime
ON collection_animes(id_membre, id_anime);

CREATE INDEX IF NOT EXISTS idx_collection_manga_member_manga
ON collection_mangas(id_membre, id_manga);

-- Index for collection statistics queries (avg evaluation)
CREATE INDEX IF NOT EXISTS idx_collection_anime_id_evaluation
ON collection_animes(id_anime, evaluation)
WHERE evaluation > 0.0;

CREATE INDEX IF NOT EXISTS idx_collection_manga_id_evaluation
ON collection_mangas(id_manga, evaluation)
WHERE evaluation > 0.0;

-- ============================================================================
-- REVIEW INDEXES (MEDIUM PRIORITY)
-- ============================================================================

-- Index for review filtering by anime and status
CREATE INDEX IF NOT EXISTS idx_critique_anime_statut
ON ak_critique(id_anime, statut)
WHERE id_anime > 0;

-- Index for review filtering by manga and status
CREATE INDEX IF NOT EXISTS idx_critique_manga_statut
ON ak_critique(id_manga, statut)
WHERE id_manga > 0;

-- Index for review filtering by jeu video and status
CREATE INDEX IF NOT EXISTS idx_critique_jeu_statut
ON ak_critique(id_jeu, statut)
WHERE id_jeu > 0;

-- ============================================================================
-- SCREENSHOT INDEXES (MEDIUM PRIORITY)
-- ============================================================================

-- Index for screenshot lookups by title ID and type
CREATE INDEX IF NOT EXISTS idx_screenshot_titre_type
ON ak_screenshots(id_titre, type);

-- ============================================================================
-- SEARCH AND FILTERING INDEXES (MEDIUM PRIORITY)
-- ============================================================================

-- Index for anime search and filtering
CREATE INDEX IF NOT EXISTS idx_anime_titre_statut
ON ak_animes(titre, statut);

-- Index for manga search and filtering
CREATE INDEX IF NOT EXISTS idx_manga_titre_statut
ON ak_mangas(titre, statut);

-- GIN index for full-text search on anime titles (if using text search)
CREATE INDEX IF NOT EXISTS idx_anime_titre_gin
ON ak_animes USING gin(to_tsvector('french', titre));

CREATE INDEX IF NOT EXISTS idx_manga_titre_gin
ON ak_mangas USING gin(to_tsvector('french', titre));

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

-- Update table statistics for query planner
ANALYZE collection_animes;
ANALYZE collection_mangas;
ANALYZE ak_critique;
ANALYZE ak_screenshots;
ANALYZE ak_animes;
ANALYZE ak_mangas;
