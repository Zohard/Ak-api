-- Add banner_image column to smf_members table
-- This allows users to customize their profile banner with a custom image URL
-- Expected dimensions: 1200x320 pixels (or similar wide banner format)

ALTER TABLE smf_members
ADD COLUMN IF NOT EXISTS banner_image VARCHAR(500);

COMMENT ON COLUMN smf_members.banner_image IS 'URL of custom profile banner image. Recommended dimensions: 1200x320 pixels';
