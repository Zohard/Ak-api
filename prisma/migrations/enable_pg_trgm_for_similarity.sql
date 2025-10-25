-- Enable pg_trgm extension for text similarity functions
-- This extension provides the similarity() function used for calculating
-- pertinence/relevance in recommendations based on title similarity

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index on anime titles for faster similarity searches (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_animes_titre_trgm ON ak_animes USING gin (titre gin_trgm_ops);

-- Create index on manga titles for faster similarity searches (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_mangas_titre_trgm ON ak_mangas USING gin (titre gin_trgm_ops);
