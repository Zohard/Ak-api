# Fix Review Reports Foreign Key

## Problem
The `ak_review_reports` table was created with a foreign key constraint that references `ak_critiques` (plural), but the actual table name is `ak_critique` (singular). This causes a 500 error when trying to report reviews.

## Solution
Run this SQL on the production database:

```sql
-- Fix foreign key constraint for review reports table
-- The original migration referenced ak_critiques (plural) instead of ak_critique (singular)

-- Drop the existing foreign key constraint if it exists
ALTER TABLE ak_review_reports
DROP CONSTRAINT IF EXISTS fk_review_reports_critique;

-- Add the correct foreign key constraint
ALTER TABLE ak_review_reports
ADD CONSTRAINT fk_review_reports_critique
FOREIGN KEY (id_critique) REFERENCES ak_critique(id_critique) ON DELETE CASCADE;
```

## How to apply

### Using Railway CLI:
```bash
railway run psql $DATABASE_URL -f prisma/migrations/fix_review_reports_fk.sql
```

### Using Prisma:
```bash
npx prisma db execute --file prisma/migrations/fix_review_reports_fk.sql
```

### Manually:
Copy the SQL above and execute it in your database console.
