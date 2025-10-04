-- Add email verification fields to smf_members table
ALTER TABLE smf_members
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Create email verification tokens table
CREATE TABLE IF NOT EXISTS ak_email_verification_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  CONSTRAINT fk_email_verification_user
    FOREIGN KEY (user_id)
    REFERENCES smf_members(id_member)
    ON DELETE CASCADE
);

-- Create index on token for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_token ON ak_email_verification_tokens(token);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON ak_email_verification_tokens(user_id);

-- Create index on expires_at for cleanup jobs
CREATE INDEX IF NOT EXISTS idx_email_verification_expires_at ON ak_email_verification_tokens(expires_at);
