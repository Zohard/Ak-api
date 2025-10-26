-- Migration: Add trailers table for anime videos
-- Created: 2025-10-26
-- Description: Creates ak_animes_trailers table to store multiple trailer videos per anime
--              with support for different platforms (YouTube, Dailymotion, Vimeo)

CREATE TABLE IF NOT EXISTS ak_animes_trailers (
  id_trailer SERIAL PRIMARY KEY,
  id_anime INTEGER NOT NULL REFERENCES ak_animes(id_anime) ON DELETE CASCADE,
  titre VARCHAR(255),
  url VARCHAR(500) NOT NULL,
  platform VARCHAR(50),
  langue VARCHAR(10) DEFAULT 'ja',
  type_trailer VARCHAR(50) DEFAULT 'PV',
  ordre INTEGER DEFAULT 0,
  date_ajout TIMESTAMPTZ DEFAULT NOW(),
  statut SMALLINT DEFAULT 1
);

-- Create index on id_anime for faster queries
CREATE INDEX IF NOT EXISTS idx_animes_trailers_id_anime ON ak_animes_trailers(id_anime);

-- Create index on statut for filtering active/inactive trailers
CREATE INDEX IF NOT EXISTS idx_animes_trailers_statut ON ak_animes_trailers(statut);

-- Add column comments for documentation
COMMENT ON TABLE ak_animes_trailers IS 'Stores trailer videos for anime with metadata';
COMMENT ON COLUMN ak_animes_trailers.id_trailer IS 'Primary key - unique trailer identifier';
COMMENT ON COLUMN ak_animes_trailers.id_anime IS 'Foreign key to ak_animes table';
COMMENT ON COLUMN ak_animes_trailers.titre IS 'Trailer title (e.g., "PV1", "Teaser", "CM")';
COMMENT ON COLUMN ak_animes_trailers.url IS 'Full URL to the video on hosting platform';
COMMENT ON COLUMN ak_animes_trailers.platform IS 'Video platform: youtube, dailymotion, vimeo';
COMMENT ON COLUMN ak_animes_trailers.langue IS 'Language code (ja, fr, en, etc.)';
COMMENT ON COLUMN ak_animes_trailers.type_trailer IS 'Trailer type: PV, Teaser, CM, Trailer';
COMMENT ON COLUMN ak_animes_trailers.ordre IS 'Display order for sorting trailers';
COMMENT ON COLUMN ak_animes_trailers.date_ajout IS 'Timestamp when trailer was added';
COMMENT ON COLUMN ak_animes_trailers.statut IS 'Status: 0=hidden, 1=visible';
