-- Add columns to support named collections while preserving existing structure
-- For collection_animes
ALTER TABLE collection_animes 
ADD COLUMN IF NOT EXISTS collection_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- For collection_mangas  
ALTER TABLE collection_mangas 
ADD COLUMN IF NOT EXISTS collection_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create default collection names based on type
UPDATE collection_animes SET collection_name = CASE 
    WHEN type = 1 THEN 'Plan to Watch'
    WHEN type = 2 THEN 'Watching' 
    WHEN type = 3 THEN 'Completed'
    WHEN type = 4 THEN 'Dropped'
    WHEN type = 5 THEN 'On Hold'
    ELSE 'Custom Collection'
END WHERE collection_name IS NULL;

UPDATE collection_mangas SET collection_name = CASE 
    WHEN type = 1 THEN 'Plan to Read'
    WHEN type = 2 THEN 'Reading'
    WHEN type = 3 THEN 'Completed' 
    WHEN type = 4 THEN 'Dropped'
    WHEN type = 5 THEN 'On Hold'
    ELSE 'Custom Collection'
END WHERE collection_name IS NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_collection_animes_membre_type ON collection_animes(id_membre, type);
CREATE INDEX IF NOT EXISTS idx_collection_animes_is_public ON collection_animes(is_public);
CREATE INDEX IF NOT EXISTS idx_collection_animes_created_at ON collection_animes(created_at);

CREATE INDEX IF NOT EXISTS idx_collection_mangas_membre_type ON collection_mangas(id_membre, type);  
CREATE INDEX IF NOT EXISTS idx_collection_mangas_is_public ON collection_mangas(is_public);
CREATE INDEX IF NOT EXISTS idx_collection_mangas_created_at ON collection_mangas(created_at);