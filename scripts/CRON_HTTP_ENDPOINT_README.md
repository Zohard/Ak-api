# Cron HTTP Endpoint Documentation

This document describes how to use the HTTP endpoints for running scheduled maintenance tasks like popularity ranking updates.

## Overview

The cron endpoints provide HTTP-based access to maintenance tasks, making them easier to call from:
- Standard Unix cron jobs
- Cloud schedulers (AWS EventBridge, Google Cloud Scheduler, etc.)
- External monitoring services
- CI/CD pipelines

## Authentication

All cron endpoints require authentication via an API key passed in the `X-Cron-Key` header.

### Setup API Key

1. Generate a secure API key (32+ characters recommended):
```bash
# Generate a random key
openssl rand -hex 32
```

2. Add it to your `.env` file:
```bash
CRON_API_KEY=your_secure_api_key_here
```

3. Restart your NestJS application to load the new environment variable.

## Available Endpoints

### 1. Update Anime Popularity Rankings

**Endpoint:** `POST /api/cron/update-anime-popularity`

**Headers:**
- `X-Cron-Key`: Your cron API key
- `Content-Type`: application/json

**Example Request:**
```bash
curl -X POST https://your-domain.com/api/cron/update-anime-popularity \
  -H "X-Cron-Key: your_secure_api_key_here" \
  -H "Content-Type: application/json"
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Updated 8246 anime rankings",
  "stats": {
    "totalAnimes": 8246,
    "updatedCount": 8246,
    "errorCount": 0,
    "executionTime": "45.23s"
  },
  "top10": [
    {
      "rank": 1,
      "id": 123,
      "titre": "One Piece",
      "annee": 1999,
      "score": 1234.56,
      "change": "+2"
    },
    // ... 9 more entries
  ]
}
```

**Error Responses:**

- **401 Unauthorized:** Invalid or missing API key
```json
{
  "statusCode": 401,
  "message": "Invalid or missing API key",
  "error": "Unauthorized"
}
```

- **500 Internal Server Error:** Server error during update
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

### 2. Update Manga Popularity Rankings

**Endpoint:** `POST /api/cron/update-manga-popularity`

**Headers:**
- `X-Cron-Key`: Your cron API key
- `Content-Type`: application/json

**Example Request:**
```bash
curl -X POST https://your-domain.com/api/cron/update-manga-popularity \
  -H "X-Cron-Key: your_secure_api_key_here" \
  -H "Content-Type: application/json"
```

**Response:** Similar format to anime endpoint

## Setup with Cron

### Method 1: Using the Shell Script (Recommended)

The provided shell script handles environment variables, logging, and error handling.

1. Configure environment variables in `.env`:
```bash
CRON_API_KEY=your_secure_api_key_here
API_BASE_URL=https://your-domain.com  # or http://localhost:3000 for local
```

2. Test the script manually:
```bash
/home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity-http.sh
```

3. Add to crontab:
```bash
crontab -e
```

4. Add cron schedule (runs at 2 AM daily):
```cron
0 2 * * * /home/zohardus/www/anime-kun-nestjs-v2/scripts/cron-update-anime-popularity-http.sh
```

### Method 2: Direct curl in Cron

You can also call the endpoint directly from cron:

```cron
# Add to crontab
0 2 * * * curl -X POST http://localhost:3000/api/cron/update-anime-popularity -H "X-Cron-Key: your_api_key" >> /var/log/anime-popularity.log 2>&1
```

## Local Development

For local testing, you can use the local TypeScript script or call localhost:

```bash
# Using TypeScript script (no API key needed)
npm run update-anime-popularity

# Using HTTP endpoint (requires API key)
curl -X POST http://localhost:3000/api/cron/update-anime-popularity \
  -H "X-Cron-Key: your_api_key_here"
```

## Production Deployment

### Environment Variables

Make sure these are set in your production environment:

```bash
# Required
CRON_API_KEY=your_secure_api_key_here
DATABASE_URL=your_database_url

# Optional
API_BASE_URL=https://your-domain.com  # for the shell script
```

### Security Best Practices

1. **Use a Strong API Key:**
   - Generate with: `openssl rand -hex 32`
   - Store securely (environment variable, secrets manager)
   - Never commit to version control

2. **Use HTTPS in Production:**
   - Always use `https://` in production
   - Never send API keys over HTTP

3. **Rotate Keys Regularly:**
   - Change the API key periodically
   - Update all cron jobs after rotation

4. **Rate Limiting:**
   - The endpoint doesn't have built-in rate limiting
   - Consider adding if exposing publicly

5. **Monitoring:**
   - Check logs regularly
   - Set up alerts for failures
   - Monitor execution time

### Railway / Vercel / Cloud Deployment

If using serverless/cloud platforms:

1. Set `CRON_API_KEY` in your platform's environment variables
2. Use your platform's cron/scheduler service:
   - **Vercel:** Use Vercel Cron
   - **Railway:** Use Railway Cron
   - **AWS:** Use EventBridge
   - **Google Cloud:** Use Cloud Scheduler

3. Configure the scheduler to hit your endpoint:
```
URL: https://your-app.railway.app/api/cron/update-anime-popularity
Method: POST
Headers: X-Cron-Key: your_api_key
Schedule: 0 2 * * *  (2 AM daily)
```

## Logs

### Shell Script Logs

Logs are stored in: `/home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-YYYY-MM-DD.log`

View today's log:
```bash
tail -f /home/zohardus/www/anime-kun-nestjs-v2/logs/anime-popularity-$(date +%Y-%m-%d).log
```

### Application Logs

NestJS logs are available in your standard application logs. Look for:
```
[CronController] Starting anime popularity update via cron endpoint
[CronService] Calculating anime popularity scores...
[CronController] Anime popularity update completed in 45.23s
```

## Monitoring

### Check if Endpoint is Working

```bash
# Test authentication
curl -X POST http://localhost:3000/api/cron/update-anime-popularity \
  -H "X-Cron-Key: wrong_key"
# Should return 401 Unauthorized

# Test successful call
curl -X POST http://localhost:3000/api/cron/update-anime-popularity \
  -H "X-Cron-Key: correct_key"
# Should return 200 OK with stats
```

### Health Check

Before the cron runs, you can verify the API is up:

```bash
curl https://your-domain.com/api/health
```

### Database Check

Verify rankings are being updated:

```bash
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) as ranked_animes,
         MAX(classement_popularite) as max_rank,
         COUNT(DISTINCT variation_popularite) as distinct_variations
  FROM ak_animes
  WHERE classement_popularite > 0;
"
```

## Troubleshooting

### 401 Unauthorized

**Problem:** Getting 401 error

**Solutions:**
1. Check `CRON_API_KEY` is set in `.env`
2. Verify the key matches in both `.env` and your curl command
3. Restart the NestJS app after changing `.env`
4. Check for extra whitespace in the key

### Endpoint Timeout

**Problem:** Request times out

**Solutions:**
1. Increase timeout in curl: `curl --max-time 300 ...`
2. Check database performance
3. Monitor server resources
4. Consider running during off-peak hours

### Endpoint Not Found (404)

**Problem:** Getting 404 error

**Solutions:**
1. Verify the app is running: `curl http://localhost:3000/api/health`
2. Check the URL is correct (include `/api` prefix)
3. Verify CronModule is imported in app.module.ts
4. Check application logs for startup errors

### Cron Not Running

**Problem:** Cron job not executing

**Solutions:**
1. Check cron service: `systemctl status cron`
2. View cron logs: `grep CRON /var/log/syslog | tail -20`
3. Verify crontab: `crontab -l`
4. Check script permissions: `ls -l /path/to/script.sh`
5. Test script manually first

## API Documentation

Once your app is running, visit the Swagger documentation:

```
http://localhost:3000/api-docs
```

Look for the "Cron Jobs" section to see interactive documentation for all cron endpoints.

## Comparison: HTTP Endpoint vs TypeScript Script

| Feature | HTTP Endpoint | TypeScript Script |
|---------|--------------|-------------------|
| **Authentication** | Requires API key | No auth needed |
| **Remote Access** | ✅ Yes | ❌ No |
| **Cloud-Friendly** | ✅ Yes | ⚠️ Limited |
| **Setup Complexity** | Medium | Simple |
| **Logging** | App logs + Script logs | Script logs only |
| **Monitoring** | HTTP status codes | Exit codes |
| **Best For** | Production/Cloud | Local/Development |

## Examples

### AWS EventBridge

```json
{
  "ScheduleExpression": "cron(0 2 * * ? *)",
  "Target": {
    "Arn": "arn:aws:lambda:...",
    "Input": {
      "url": "https://your-api.com/api/cron/update-anime-popularity",
      "headers": {
        "X-Cron-Key": "${CRON_API_KEY}"
      }
    }
  }
}
```

### GitHub Actions

```yaml
name: Update Anime Popularity
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cron Endpoint
        run: |
          curl -X POST ${{ secrets.API_BASE_URL }}/api/cron/update-anime-popularity \
            -H "X-Cron-Key: ${{ secrets.CRON_API_KEY }}" \
            -H "Content-Type: application/json"
```

### Docker Compose

```yaml
services:
  cron:
    image: alpine:latest
    command: sh -c "echo '0 2 * * * curl -X POST http://api:3000/api/cron/update-anime-popularity -H \"X-Cron-Key: $$CRON_API_KEY\"' | crontab - && crond -f"
    environment:
      - CRON_API_KEY=${CRON_API_KEY}
    depends_on:
      - api
```

## Support

For issues or questions:
1. Check application logs
2. Verify environment variables
3. Test endpoint manually with curl
4. Review this documentation

## Related Files

- `src/modules/cron/cron.controller.ts` - HTTP endpoint implementation
- `src/modules/cron/cron.service.ts` - Business logic
- `scripts/cron-update-anime-popularity-http.sh` - Shell script wrapper
- `scripts/update-anime-popularity.ts` - Standalone TypeScript script
