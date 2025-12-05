# Cron-Job.org Setup Guide

Complete setup instructions for preventing cold starts using cron-job.org (100% free).

---

## Step 1: Create Account

1. Go to https://console.cron-job.org/jobs/create
2. Sign up for a free account (if you don't have one)
3. Verify your email

---

## Step 2: Create the Cron Job

### Job Configuration

Fill in the form with these exact values:

#### **Title**
```
Anime-Kun API Warmup
```

#### **Address (URL)**
```
https://ak-api-three.vercel.app/api/health
```

#### **Schedule**
- **Execution**: Every 5 minutes
- Or in cron notation: `*/5 * * * *`

#### **Request Method**
- Select: `GET`

#### **Request Timeout**
- Set to: `30 seconds`

#### **Advanced Settings** (Click to expand)

**Save responses:**
- Select: `Save only failed executions`

**Notifications:**
- Enable: `Notify me on failed executions` (optional but recommended)
- Email: Your email address

**Execution:**
- Leave all other settings as default

---

## Step 3: Save and Activate

1. Click **"Create cron job"**
2. Verify the job appears in your dashboard
3. Status should be: **"Enabled"**
4. Click **"Run now"** to test it immediately

---

## Step 4: Verify It's Working

### Test the Job

1. After creating, click **"Run now"** in the dashboard
2. Wait 10 seconds
3. Check the execution log:
   - Status should be: ✅ **200 OK**
   - Response time: ~50-300ms

### View Execution History

1. Click on your job name
2. Go to **"Execution history"** tab
3. You should see successful executions every 5 minutes

### Test the Endpoint Manually

Open terminal and run:
```bash
curl https://ak-api-three.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-05T...",
  "uptime": 123.45,
  "environment": "production"
}
```

---

## What This Does

### The Magic

Every 5 minutes, cron-job.org will:
1. Send a GET request to `/api/health`
2. Wake up your Vercel function (if sleeping)
3. Keep it warm and responsive
4. Use **zero database connections** (lightweight endpoint)

### Expected Behavior

**Without warmup:**
- First request: 2-5 seconds (cold start)
- Subsequent requests: 100-300ms
- Cold start happens frequently

**With cron-job.org:**
- First request: 100-300ms (already warm!)
- All requests: 50-200ms
- Cold starts: Rare (only if job fails or >10 min idle)

---

## Monitoring and Alerts

### Dashboard Overview

cron-job.org dashboard shows:
- ✅ Total successful executions
- ❌ Failed executions
- 📊 Average response time
- 📈 Success rate (should be 99%+)

### Email Alerts (Optional)

If you enabled notifications:
- You'll get an email if the job fails
- Usually means your API is down (rare)
- Good for monitoring uptime

### Check Your Stats

After 24 hours, you should see:
- Executions: ~288 (24 hours × 12 executions/hour)
- Success rate: 99%+
- Average response time: 50-300ms

---

## Troubleshooting

### Job is failing (Status: 500 or timeout)

**Check:**
1. Is your Vercel deployment successful?
2. Can you access the URL manually in a browser?
3. Check Vercel logs for errors

**Solution:**
- Fix the API issue
- Job will auto-resume when API is back up

### Response time is slow (>1 second)

**Possible causes:**
1. Cold start still happening (wait 5-10 minutes)
2. Database connection issues
3. Too many concurrent requests

**Solution:**
- Check Neon dashboard for CPU usage
- Reduce `connection_limit` if needed (currently 5)

### Job stopped running

**Check:**
1. Is the job still enabled in dashboard?
2. Did you hit the free plan limit?

**Free plan limits:**
- Jobs: Unlimited
- Executions: Unlimited
- No restrictions for this use case ✅

---

## Cost Breakdown

### Cron-job.org Free Plan

- ✅ Unlimited jobs
- ✅ Unlimited executions
- ✅ 1-minute minimum interval (we use 5 minutes)
- ✅ Email notifications
- ✅ Execution history (last 100)
- ✅ No credit card required

**Total cost: $0/month forever**

### Comparison with Alternatives

| Service | Free Tier | Interval | Setup |
|---------|-----------|----------|-------|
| **cron-job.org** | ✅ Unlimited | 1 min | Easy |
| UptimeRobot | 50 monitors | 5 min | Easy |
| Vercel Cron | ❌ Pro only | 1 min | Auto |
| Better Uptime | 10 monitors | 3 min | Medium |

**Recommendation:** cron-job.org is perfect for this use case! ✅

---

## Advanced: Multiple Endpoints (Optional)

If you want to warm up multiple endpoints, create additional jobs:

### Job 1: Health Check (Current)
- URL: `https://ak-api-three.vercel.app/api/health`
- Schedule: Every 5 minutes
- Purpose: Keep function warm

### Job 2: Homepage Cache (Optional)
- URL: `https://ak-api-three.vercel.app/api/homepage`
- Schedule: Every 15 minutes
- Purpose: Pre-warm homepage cache

### Job 3: Database Check (Optional)
- URL: `https://ak-api-three.vercel.app/api/health/full`
- Schedule: Every 30 minutes
- Purpose: Verify database connectivity

**Recommendation:** Start with Job 1 only. Add others if needed.

---

## Security Note

### Is it safe to expose /api/health?

✅ **Yes, completely safe!**

The `/api/health` endpoint:
- Does NOT require authentication
- Does NOT access the database
- Does NOT expose sensitive information
- Only returns basic server status

It's designed to be publicly accessible for monitoring purposes.

---

## Summary

✅ **You've set up:**
- Free automated warmup (every 5 minutes)
- Zero cost solution
- Email alerts for failures
- Execution history and monitoring

🎯 **Result:**
- No more cold starts
- Fast response times (50-300ms)
- Neon CPU stays low (<50%)
- $0/month cost

---

## Quick Reference

**Cron Job Settings:**
```
Title: Anime-Kun API Warmup
URL: https://ak-api-three.vercel.app/api/health
Method: GET
Schedule: */5 * * * * (every 5 minutes)
Timeout: 30 seconds
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-05T...",
  "uptime": 123.45
}
```

---

Need help? Check the main guide: `COLD_START_PREVENTION.md`
