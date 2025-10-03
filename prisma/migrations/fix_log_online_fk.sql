-- Fix foreign key constraint to allow guests (id_member = 0)
-- The FK constraint prevents guests (id_member = 0) from being tracked
-- because there's no member with id = 0 in smf_members table

-- Drop the foreign key constraint
ALTER TABLE smf_log_online DROP CONSTRAINT IF EXISTS fk_log_online_member;

-- Note: We don't re-add the FK constraint because:
-- 1. Guests have id_member = 0 which doesn't exist in smf_members
-- 2. SMF's original design doesn't have this FK constraint
-- 3. We handle data integrity at the application level
