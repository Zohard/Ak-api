-- Fix ak_review_reports.status column type mismatch
-- Actual DB has VARCHAR(50) NOT NULL but Prisma schema expects INT @default(0)
-- This caused "invalid byte sequence for encoding UTF8: 0x00" on INSERT

ALTER TABLE ak_review_reports
  ALTER COLUMN status TYPE INTEGER USING (
    CASE
      WHEN status ~ '^\d+$' THEN status::integer
      ELSE 0
    END
  ),
  ALTER COLUMN status SET DEFAULT 0,
  ALTER COLUMN status SET NOT NULL;
