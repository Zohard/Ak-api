# Quick Setup: Cold Start Prevention

## TL;DR - What I Need to Do

### Option 1: Free Setup (Recommended to Start)

1. **Deploy the code** (already done in your repo):
   ```bash
   cd /home/zohardus/www/anime-kun-nestjs-v2
   git add .
   git commit -m "Add cold start prevention"
   git push
   ```

2. **Sign up for UptimeRobot** (free): https://uptimerobot.com

3. **Add a monitor**:
   - URL: `https://ak-api-three.vercel.app/api/health`
   - Interval: 5 minutes
   - Type: HTTP(s)

4. **Done!** Your API will stay warm.

**Cost: $0/month**

---

### Option 2: Vercel Pro (If you already have Pro plan)

1. **Deploy the code** (same as above)

2. **Verify in Vercel Dashboard**:
   - Go to Project → Settings → Cron Jobs
   - Should see: `/api/health/warmup` every 5 minutes

3. **Done!** Cron runs automatically.

**Cost: Included in your $20/month Vercel Pro plan**

---

## What This Does

- **Pings your API every 5 minutes** to keep it warm
- **Uses lightweight endpoint** (no database queries)
- **Reduces Neon connections** from 10 to 5 max per instance
- **Result**: Fast response times, low CPU usage

---

## Monitoring

### Check if it's working:

```bash
# Test the health endpoint
curl https://ak-api-three.vercel.app/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-12-05T...",
  "uptime": 123.45,
  "environment": "production"
}
```

### Monitor Neon usage:

1. Go to Neon dashboard
2. Check **Active Connections** (should stay low, max 5 per function)
3. Check **Compute Hours** (should stay under 192 hours/month for free tier)

---

## Troubleshooting

**Cold starts still happening?**
- Check external monitor is running (UptimeRobot or cron)
- Verify monitor pings `/api/health` not `/api/health/full`

**Neon CPU at 100%?**
- Reduce `connection_limit` from 5 to 3 in `src/shared/services/prisma.service.ts` line 31
- Add more caching in your endpoints

**Too many connections?**
- Verify DATABASE_URL includes `pgbouncer=true`
- Check you're using the `-pooler` endpoint

---

## Next Steps (Optional Optimizations)

1. **Increase cache TTL** for static data to reduce DB queries
2. **Add database indexes** for slow queries
3. **Upgrade Neon plan** if hitting free tier limits ($19/month for Scale plan)

---

For full details, see `COLD_START_PREVENTION.md`
