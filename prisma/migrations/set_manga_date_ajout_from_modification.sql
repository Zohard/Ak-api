-- Set date_ajout for ak_mangas table
-- Use date_modification if available (not 0), otherwise use current timestamp

-- Update date_ajout based on date_modification (Unix timestamp)
UPDATE ak_mangas
SET date_ajout = to_timestamp(date_modification)
WHERE date_ajout IS NULL
  AND date_modification IS NOT NULL
  AND date_modification > 0;

-- For remaining NULL values (where date_modification is 0 or NULL), use current timestamp
UPDATE ak_mangas
SET date_ajout = CURRENT_TIMESTAMP
WHERE date_ajout IS NULL;

-- Then alter the column to add default and make it NOT NULL
ALTER TABLE ak_mangas
ALTER COLUMN date_ajout SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN date_ajout SET NOT NULL;
