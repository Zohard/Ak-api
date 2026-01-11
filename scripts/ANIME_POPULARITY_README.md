# Anime Popularity Ranking System

This system automatically calculates and updates anime popularity rankings based on multiple factors including user collections, reviews, views, and ratings.

## Popularity Formula

The popularity score is calculated using the following formula:

```
popularityScore = (usersInCollection × 10) + (avgReviewScore × 5) + (views ÷ 100) + (collectionScore × 2)
```

Where:
- **usersInCollection**: Number of unique users who have this anime in their collection
- **avgReviewScore**: Average review score from `ak_animes.moyennenotes` (0-10 scale)
- **views**: Total views from `ak_animes.nb_clics`
- **collectionScore**: Average user rating from `collection_animes.evaluation`

The script ranks all published animes (status = 1) and stores:
- **classement_popularite**: The popularity rank (1 = most popular)
- **variation_popularite**: Change indicator ("+5", "-3", "NEW", "=")

## Files

- `update-anime-popularity.ts` - Main TypeScript script that calculates rankings
- `cron-update-anime-popularity.sh` - Shell wrapper for cron execution with logging

## Manual Execution

You can run the popularity update manually at any time:

```bash
cd /home/zohardus/www/anime-kun-nestjs-v2
npm run update-anime-popularity
```

## Automated Nightly Updates

### Setup Cron Job

1. Open your crontab for editing:
```bash
crontab -e
```

2. Add one of these cron schedules:

**Run at 2 AM every night:**
```cron
0 2 * * * /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity.sh
```

**Run at 3:30 AM every night:**
```cron
30 3 * * * /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity.sh
```

**Run at midnight every Sunday (weekly):**
```cron
0 0 * * 0 /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity.sh
```

3. Save and exit (in nano: Ctrl+X, then Y, then Enter)

4. Verify the cron job was added:
```bash
crontab -l
```

### Cron Schedule Format

```
* * * * * command
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 = Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

### Examples

```cron
# Every day at 2:00 AM
0 2 * * * /path/to/script.sh

# Every day at 3:30 AM
30 3 * * * /path/to/script.sh

# Every 6 hours
0 */6 * * * /path/to/script.sh

# Every Monday at 1:00 AM
0 1 * * 1 /path/to/script.sh

# First day of every month at midnight
0 0 1 * * /path/to/script.sh
```

## Logs

Logs are automatically created in `/home/zohardus/www/anime-kun-nestjs-v2/logs/` with the format:
```
anime-popularity-YYYY-MM-DD.log
```

Old logs (>30 days) are automatically cleaned up.

### View Recent Logs

```bash
# View today's log
tail -f /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-$(date +%Y-%m-%d).log

# View last 50 lines of today's log
tail -n 50 /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-$(date +%Y-%m-%d).log

# List all popularity logs
ls -lh /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-*.log
```

## Monitoring

### Check if Cron is Running

```bash
# View cron service status
systemctl status cron

# View recent cron executions
grep CRON /var/log/syslog | tail -20
```

### Check Last Update

```bash
# Check database for last update time
psql 'postgresql://neondb_owner:npg_Vlut8bsZv9kU@ep-tiny-glade-abx9qg4a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require' -c "
  SELECT COUNT(*) as total_ranked,
         MAX(classement_popularite) as max_rank
  FROM ak_animes
  WHERE classement_popularite > 0;
"
```

### View Current Top 10

```bash
psql 'postgresql://neondb_owner:npg_Vlut8bsZv9kU@ep-tiny-glade-abx9qg4a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require' -c "
  SELECT classement_popularite as rank,
         titre,
         annee,
         variation_popularite as change
  FROM ak_animes
  WHERE statut = 1 AND classement_popularite > 0
  ORDER BY classement_popularite ASC
  LIMIT 10;
"
```

## Troubleshooting

### Cron Job Not Running

1. Check if cron service is active:
```bash
systemctl status cron
```

2. Check cron logs for errors:
```bash
grep CRON /var/log/syslog | tail -20
```

3. Verify script has execute permissions:
```bash
ls -l /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity.sh
```

4. Test the script manually:
```bash
/home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity.sh
```

### Database Connection Issues

Check if DATABASE_URL is set in `.env`:
```bash
grep DATABASE_URL /home/zohardus/www/anime-kun-nestjs-v2/.env
```

### Script Errors

Check the log file for detailed error messages:
```bash
tail -100 /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-$(date +%Y-%m-%d).log
```

## Testing

Before setting up the cron job, test the script manually:

```bash
# Test the TypeScript script directly
cd /home/zohardus/www/anime-kun-nestjs-v2
npm run update-anime-popularity

# Test the cron shell script
./scripts/cron-update-anime-popularity.sh
```

The script will display:
- Number of animes processed
- Progress updates
- Top 10 most popular animes
- Execution time

## Performance

- Typical execution time: 30-60 seconds for ~5000 animes
- Database load: Medium (complex queries with aggregations)
- Recommended schedule: Once per day during low-traffic hours (2-4 AM)

## Notes

- Only published animes (status = 1) are ranked
- Animes without any collection data will still get ranked (score based on reviews and views)
- Rankings are calculated fresh each time (not incremental)
- Previous rank is preserved to calculate variation indicators
- New animes get "NEW" as their variation indicator
