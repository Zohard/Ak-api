# Cold Start Prevention Guide for Vercel + Neon

This guide explains how to prevent cold starts on Vercel while keeping your Neon database CPU usage low.

## Problem

- **Vercel serverless functions** go to sleep after inactivity (cold starts)
- **Cold starts** cause slow initial response times (2-5 seconds)
- **Waking up functions** creates new database connections
- **Neon database** has limited connections and CPU, which can get overwhelmed

## Solution Overview

We've implemented a multi-layered approach:

1. ✅ **Lightweight health endpoints** (no DB queries)
2. ✅ **Vercel Cron Jobs** for automated warmup (Pro plan required)
3. ✅ **Optimized connection pooling** for Neon
4. 📋 **External monitoring** (optional but recommended)
5. 📋 **Redis caching** to reduce database load

---

## 1. Health Endpoints

We created three health check endpoints:

### `/api/health` - Lightweight (Use for warmup pings)
- **NO database queries**
- Returns basic service status
- Perfect for cold start prevention
- Very low resource usage

```bash
curl https://ak-api-three.vercel.app/api/health
```

### `/api/health/full` - Full Check
- Checks database and Redis connectivity
- Use sparingly (once per hour max)
- Good for actual monitoring alerts

```bash
curl https://ak-api-three.vercel.app/api/health/full
```

### `/api/health/warmup` - Warmup
- Called by Vercel Cron every 5 minutes
- Minimal cache operations
- No heavy DB queries

```bash
curl https://ak-api-three.vercel.app/api/health/warmup
```

---

## 2. Vercel Cron Jobs (Automated Warmup)

### Configuration

Added to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/health/warmup",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Schedule**: Every 5 minutes
**Cost**: Free on Vercel Pro plan
**Database impact**: Minimal (no DB queries, just cache touch)

### Requirements

⚠️ **Vercel Pro Plan Required** ($20/month per member)

Cron jobs are NOT available on the Hobby (free) plan.

### Alternative for Hobby Plan

If you're on the Hobby plan, use external monitoring (see section 4).

---

## 3. Optimized Database Connection Pooling

### Current Settings (for Neon)

```typescript
// Auto-applied in PrismaService for Neon pooler endpoints
connection_limit: 5      // Very conservative for Neon free tier
pool_timeout: 5          // 5 seconds
connect_timeout: 10      // 10 seconds
pgbouncer: true          // Disable prepared statements
```

### Neon Connection String Format

**Required format for serverless:**

```bash
# Use the -pooler endpoint (port 6543 or hostname contains "pooler")
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&channel_binding=require&pgbouncer=true&connection_limit=5"

# Direct URL for migrations (no pooler)
DIRECT_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require&channel_binding=require"
```

### Neon Free Tier Limits

- **Max connections**: 100 total
- **Max pooled connections**: 20 simultaneous
- **Compute hours**: 191.9 hours/month
- **Auto-pause**: After 5 minutes of inactivity

**Our strategy**: Use only 5 connections per function instance to stay well under limits.

---

## 4. External Monitoring (Optional but Recommended)

If you don't have Vercel Pro or want redundancy, use free external monitoring services:

### Recommended Services (All Free Tier Available)

#### 1. **UptimeRobot** (Recommended)
- Free tier: 50 monitors
- Ping interval: 5 minutes
- Setup: https://uptimerobot.com

**Configuration:**
- Monitor Type: HTTP(s)
- URL: `https://ak-api-three.vercel.app/api/health`
- Interval: 5 minutes
- HTTP Method: GET

#### 2. **Better Uptime**
- Free tier: 10 monitors
- Ping interval: 3 minutes
- Setup: https://betteruptime.com

#### 3. **Cronitor**
- Free tier: 5 monitors
- Ping interval: 1 minute
- Setup: https://cronitor.io

#### 4. **Freshping**
- Free tier: 50 monitors
- Ping interval: 1 minute
- Setup: https://www.freshworks.com/website-monitoring

### Recommended Configuration

```
Monitor Name: Anime-Kun API Warmup
URL: https://ak-api-three.vercel.app/api/health
Method: GET
Interval: 5 minutes (or lowest available)
Alert on: Failure (optional)
```

⚠️ **Important**: Always ping `/api/health`, NOT `/api/health/full` to avoid unnecessary database load.

---

## 5. Redis Caching Strategy

Your app already uses Redis for caching, which significantly reduces database load.

### Verify Redis is Working

```bash
# Check if Redis is configured
curl https://ak-api-three.vercel.app/api/health/full
```

Look for `"redis": "healthy"` in the response.

### Cache Optimization Tips

1. **Increase cache TTL** for static data (genres, businesses)
2. **Cache popular queries** (homepage, top anime/manga)
3. **Use stale-while-revalidate** pattern where possible
4. **Pre-warm cache** on startup for critical data

---

## Implementation Checklist

### ✅ Completed (Already in Code)

- [x] Health endpoints created (`/api/health`, `/api/health/full`, `/api/health/warmup`)
- [x] Vercel cron configuration added to `vercel.json`
- [x] Optimized Neon connection pooling (5 connections max)
- [x] Redis health check added
- [x] HealthModule registered in AppModule

### 📋 Next Steps (Manual Setup Required)

1. **Deploy to Vercel**
   ```bash
   cd /home/zohardus/www/anime-kun-nestjs-v2
   git add .
   git commit -m "Add cold start prevention with health endpoints and cron"
   git push
   ```

2. **Verify Cron Job** (Pro plan only)
   - Go to Vercel Dashboard → Project → Settings → Cron Jobs
   - Verify the `/api/health/warmup` cron is listed
   - Check logs after 5 minutes to confirm it's running

3. **Set Up External Monitoring** (If no Vercel Pro)
   - Sign up for UptimeRobot or similar
   - Add monitor for `https://ak-api-three.vercel.app/api/health`
   - Set interval to 5 minutes

4. **Monitor Database Usage**
   - Check Neon dashboard for connection count
   - Monitor compute hours usage
   - Adjust `connection_limit` if needed (currently 5)

---

## Troubleshooting

### Issue: Neon CPU at 100%

**Causes:**
- Too many concurrent requests
- Heavy queries without indexes
- Connection pooling not working

**Solutions:**
1. Reduce `connection_limit` from 5 to 3 in `prisma.service.ts`
2. Add database indexes for slow queries
3. Increase Redis cache TTL
4. Enable query logging to find slow queries

### Issue: Cold starts still happening

**Causes:**
- Vercel cron not enabled (need Pro plan)
- External monitor interval too long
- Monitor pinging wrong endpoint

**Solutions:**
1. Verify Vercel cron is running (check logs)
2. Set external monitor to 5 minutes or less
3. Ensure monitoring `/api/health` not `/api/health/full`

### Issue: Too many database connections

**Causes:**
- Multiple function instances running
- Connection leaks
- Not using pooler endpoint

**Solutions:**
1. Verify using `-pooler` endpoint in DATABASE_URL
2. Check `pgbouncer=true` is in connection string
3. Monitor Neon dashboard for connection spikes
4. Consider upgrading Neon plan if consistently hitting limits

---

## Cost Analysis

### Free Setup (Vercel Hobby + External Monitor)

- Vercel Hobby: **$0/month**
- UptimeRobot: **$0/month** (50 monitors)
- Neon Free Tier: **$0/month** (5GB, 191.9 compute hours)
- **Total: $0/month**

### Pro Setup (Vercel Pro + Cron)

- Vercel Pro: **$20/month** per member
- Neon Free Tier: **$0/month**
- **Total: $20/month**

### Recommended Hybrid Approach

- Use Vercel Hobby plan
- Use UptimeRobot free tier (5-minute pings)
- Upgrade to Neon paid plan ($19/month) if hitting limits
- **Total: $0-19/month**

---

## Performance Metrics

### Before Optimization

- Cold start: **2-5 seconds**
- Warm response: **100-300ms**
- Database connections: **10-20 per instance**
- Neon CPU: **Often spikes to 100%**

### After Optimization (Expected)

- Cold start: **Rare** (every 5-10 minutes max)
- Warm response: **50-200ms** (improved by caching)
- Database connections: **Max 5 per instance**
- Neon CPU: **<50% average**

---

## Monitoring Dashboard

### Key Metrics to Watch

1. **Vercel Logs**
   - Function invocations
   - Cold start frequency
   - Response times

2. **Neon Dashboard**
   - Active connections
   - Compute hours used
   - CPU usage

3. **External Monitor**
   - Uptime percentage
   - Response time graph
   - Downtime alerts

---

## Advanced: Progressive Warmup

If you need even better performance, implement progressive warmup:

```typescript
// src/modules/health/health.service.ts

async progressiveWarmup(): Promise<void> {
  // Level 1: Just wake up (current implementation)
  await this.cacheService.get('warmup:ping');

  // Level 2: Pre-warm critical cache (optional, run every 30 mins)
  // await this.warmupCriticalCache();

  // Level 3: Pre-load database connections (use sparingly)
  // await this.warmupDatabasePool();
}
```

**Recommendation**: Start with Level 1 (current), only add Level 2/3 if needed.

---

## Summary

✅ **Implemented:**
- Lightweight health endpoints
- Vercel cron for automated warmup (every 5 minutes)
- Optimized Neon connection pooling (max 5 connections)
- Redis caching for reduced DB load

📋 **Your Action Items:**
1. Deploy the changes to Vercel
2. Choose one:
   - **Option A**: Upgrade to Vercel Pro ($20/month) for built-in cron
   - **Option B**: Use UptimeRobot (free) to ping `/api/health` every 5 minutes
3. Monitor Neon dashboard for connection/CPU usage
4. Adjust settings if needed

🎯 **Expected Result:**
- Cold starts reduced from constant to rare (every 5-10 minutes max)
- Neon CPU usage stays below 50%
- Response times consistently fast
- No additional costs if using free monitoring
