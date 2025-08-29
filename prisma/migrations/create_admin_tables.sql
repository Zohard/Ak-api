-- Create moderation reports table
CREATE TABLE IF NOT EXISTS moderation_reports (
    id SERIAL PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES smf_members(id_member) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL,
    content_id INTEGER NOT NULL,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    moderator_id INTEGER REFERENCES smf_members(id_member) ON DELETE SET NULL,
    moderator_action VARCHAR(50),
    moderator_reason TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    INDEX idx_content (content_type, content_id),
    INDEX idx_status (status),
    INDEX idx_reporter (reporter_id),
    INDEX idx_moderator (moderator_id)
);

-- Create admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES smf_members(id_member) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INTEGER,
    reason TEXT,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin (admin_id),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at)
);

-- Create moderation log table
CREATE TABLE IF NOT EXISTS moderation_log (
    id SERIAL PRIMARY KEY,
    moderator_id INTEGER NOT NULL REFERENCES smf_members(id_member) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_moderator (moderator_id),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at)
);

-- Add moderation fields to ak_critique if they don't exist
ALTER TABLE ak_critique 
ADD COLUMN IF NOT EXISTS moderated_by INTEGER REFERENCES smf_members(id_member) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS moderated_at INTEGER,
ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_critique_status ON ak_critique(statut);
CREATE INDEX IF NOT EXISTS idx_critique_moderated ON ak_critique(moderated_by);
CREATE INDEX IF NOT EXISTS idx_critique_user ON ak_critique(user_id);
CREATE INDEX IF NOT EXISTS idx_critique_anime ON ak_critique(anime_id);
CREATE INDEX IF NOT EXISTS idx_critique_manga ON ak_critique(manga_id);

-- Create system settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_by INTEGER REFERENCES smf_members(id_member) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
);

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('site_name', 'Anime-Kun', 'Site name displayed in the header'),
('maintenance_mode', 'false', 'Whether the site is in maintenance mode'),
('registration_enabled', 'true', 'Whether new user registration is enabled'),
('review_moderation_enabled', 'true', 'Whether reviews require moderation'),
('max_upload_size', '10485760', 'Maximum file upload size in bytes (10MB)'),
('supported_image_formats', 'jpg,jpeg,png,webp', 'Comma-separated list of supported image formats'),
('cache_enabled', 'true', 'Whether caching is enabled'),
('backup_frequency', 'daily', 'How often to perform database backups')
ON CONFLICT (setting_key) DO NOTHING;