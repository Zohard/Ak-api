# Cron Jobs Quick Start Guide

Choose between two methods for running scheduled popularity updates:

## ⚡ Quick Setup (HTTP Endpoint - Recommended)

### 1. Generate and Configure API Key

```bash
# Generate a secure API key
openssl rand -hex 32

# Add to .env file
echo "CRON_API_KEY=your_generated_key_here" >> .env
```

### 2. Test the Endpoint

```bash
# Start your NestJS app
npm run start:dev

# Test the endpoint (in another terminal)
curl -X POST http://localhost:3000/api/cron/update-anime-popularity \
  -H "X-Cron-Key: your_generated_key_here"
```

### 3. Setup Cron Job

```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity-http.sh
```

**Done!** ✅ The API endpoint will be called every night at 2 AM.

---

## 🔧 Alternative: TypeScript Script Method

### 1. Test the Script

```bash
cd /home/zohardus/www/anime-kun-nestjs-v2
npm run update-anime-popularity
```

### 2. Setup Cron Job

```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity.sh
```

**Done!** ✅ The TypeScript script will run every night at 2 AM.

---

## 📋 Method Comparison

| Feature | HTTP Endpoint | TypeScript Script |
|---------|---------------|-------------------|
| Setup Time | 2 minutes | 1 minute |
| Requires API Key | ✅ Yes | ❌ No |
| Works with Cloud | ✅ Yes (Railway, Vercel, etc.) | ⚠️ Limited |
| Remote Monitoring | ✅ Yes (HTTP status) | ❌ No |
| Best For | Production, Cloud | Local, Simple setups |

---

## 📊 Available Endpoints

### Update Anime Popularity
```bash
curl -X POST http://localhost:3000/api/cron/update-anime-popularity \
  -H "X-Cron-Key: your_api_key"
```

### Update Manga Popularity
```bash
curl -X POST http://localhost:3000/api/cron/update-manga-popularity \
  -H "X-Cron-Key: your_api_key"
```

---

## 🔍 View Logs

```bash
# Today's log
tail -f /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-$(date +%Y-%m-%d).log

# Last 50 lines
tail -n 50 /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-$(date +%Y-%m-%d).log
```

---

## 🚨 Troubleshooting

### Endpoint returns 401 Unauthorized

**Fix:** Check your API key
```bash
# Verify key is in .env
grep CRON_API_KEY .env

# Test with correct key
curl -X POST http://localhost:3000/api/cron/update-anime-popularity \
  -H "X-Cron-Key: $(grep CRON_API_KEY .env | cut -d= -f2)"
```

### Cron job not running

**Fix:** Check cron service and logs
```bash
# Check if cron is running
systemctl status cron

# View cron logs
grep CRON /var/log/syslog | tail -20

# Verify your crontab
crontab -l
```

### Script permission denied

**Fix:** Make script executable
```bash
chmod +x /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity-http.sh
```

---

## 📚 Full Documentation

- **HTTP Endpoint Details:** `CRON_HTTP_ENDPOINT_README.md`
- **TypeScript Script Details:** `ANIME_POPULARITY_README.md`

---

## ⏰ Cron Schedule Examples

```bash
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

---

## 🌐 Production Deployment

### Railway

1. Add environment variable:
   ```
   CRON_API_KEY=your_secure_key
   ```

2. Use Railway Cron or external service to hit:
   ```
   https://your-app.railway.app/api/cron/update-anime-popularity
   ```

### Vercel

1. Add environment variable in Vercel dashboard

2. Use Vercel Cron in `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/cron/update-anime-popularity",
       "schedule": "0 2 * * *"
     }]
   }
   ```

### AWS / Google Cloud

Use EventBridge / Cloud Scheduler to POST to your endpoint with the API key header.

---

## ✅ Verification

Check if rankings are being updated:

```bash
psql "$DATABASE_URL" -c "
  SELECT
    COUNT(*) as total_ranked,
    COUNT(CASE WHEN variation_popularite = 'NEW' THEN 1 END) as new_entries,
    COUNT(CASE WHEN variation_popularite LIKE '+%' THEN 1 END) as improved
  FROM ak_animes
  WHERE classement_popularite > 0;
"
```

View top 10:

```bash
psql "$DATABASE_URL" -c "
  SELECT classement_popularite, titre, variation_popularite
  FROM ak_animes
  WHERE statut = 1 AND classement_popularite > 0
  ORDER BY classement_popularite ASC
  LIMIT 10;
"
```
