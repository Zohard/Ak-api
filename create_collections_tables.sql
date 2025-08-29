-- Create Collections tables
CREATE TABLE IF NOT EXISTS ak_collections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES smf_members(id_member) ON DELETE CASCADE
);

-- Create Collection Anime Relations
CREATE TABLE IF NOT EXISTS ak_collection_animes (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER NOT NULL,
    anime_id INTEGER NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    rating REAL,
    FOREIGN KEY (collection_id) REFERENCES ak_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (anime_id) REFERENCES ak_animes(id_anime) ON DELETE CASCADE,
    UNIQUE(collection_id, anime_id)
);

-- Create Collection Manga Relations
CREATE TABLE IF NOT EXISTS ak_collection_mangas (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER NOT NULL,
    manga_id INTEGER NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    rating REAL,
    FOREIGN KEY (collection_id) REFERENCES ak_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (manga_id) REFERENCES ak_mangas(id_manga) ON DELETE CASCADE,
    UNIQUE(collection_id, manga_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON ak_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_is_public ON ak_collections(is_public);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON ak_collections(created_at);

CREATE INDEX IF NOT EXISTS idx_collection_animes_collection_id ON ak_collection_animes(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_animes_anime_id ON ak_collection_animes(anime_id);
CREATE INDEX IF NOT EXISTS idx_collection_animes_added_at ON ak_collection_animes(added_at);

CREATE INDEX IF NOT EXISTS idx_collection_mangas_collection_id ON ak_collection_mangas(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_mangas_manga_id ON ak_collection_mangas(manga_id);
CREATE INDEX IF NOT EXISTS idx_collection_mangas_added_at ON ak_collection_mangas(added_at);