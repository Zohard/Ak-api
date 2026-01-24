# Cron Jobs Documentation

API endpoints for scheduled tasks (popularity calculations, counter resets, notifications).

These endpoints are designed to be triggered by external cron services like cron-job.org.

---

## Authentication

All cron endpoints require authentication via the `x-cron-api-key` header:

```bash
curl -X POST "https://ak-api-three.vercel.app/api/jobs/cron/popularity/daily" \
  -H "x-cron-api-key: YOUR_CRON_API_KEY"
```

Set the `CRON_API_KEY` environment variable in your backend deployment.

---

## Popularity Jobs

### POST `/api/jobs/cron/popularity/daily`

Recalculates popularity scores for reviews created in the last 7 days.

**Schedule:** Daily at 3:00 AM
**Cron expression:** `0 3 * * *`

**Response:**
```json
{
  "success": true,
  "job": "daily-popularity",
  "message": "Daily popularity recalculation for recent reviews completed",
  "duration": "1234ms",
  "timestamp": "2025-01-24T03:00:00.000Z"
}
```

---

### POST `/api/jobs/cron/popularity/weekly`

Recalculates popularity scores for ALL reviews (full recalculation).

**Schedule:** Weekly on Sunday at 4:00 AM
**Cron expression:** `0 4 * * 0`

**Response:**
```json
{
  "success": true,
  "job": "weekly-popularity",
  "message": "Weekly popularity recalculation for all reviews completed",
  "duration": "45678ms",
  "timestamp": "2025-01-24T04:00:00.000Z"
}
```

---

## Counter Reset Jobs

### POST `/api/jobs/cron/counters/reset-daily`

Resets daily view counters for all content.

**Schedule:** Daily at midnight
**Cron expression:** `0 0 * * *`

**Response:**
```json
{
  "success": true,
  "job": "reset-daily-counters",
  "message": "Daily view counters reset completed",
  "timestamp": "2025-01-24T00:00:00.000Z"
}
```

---

### POST `/api/jobs/cron/counters/reset-weekly`

Resets weekly view counters for all content.

**Schedule:** Weekly on Monday at midnight
**Cron expression:** `0 0 * * 1`

**Response:**
```json
{
  "success": true,
  "job": "reset-weekly-counters",
  "message": "Weekly view counters reset completed",
  "timestamp": "2025-01-24T00:00:00.000Z"
}
```

---

### POST `/api/jobs/cron/counters/reset-monthly`

Resets monthly view counters for all content.

**Schedule:** Monthly on the 1st at midnight
**Cron expression:** `0 0 1 * *`

**Response:**
```json
{
  "success": true,
  "job": "reset-monthly-counters",
  "message": "Monthly view counters reset completed",
  "timestamp": "2025-01-24T00:00:00.000Z"
}
```

---

## Notifications Jobs

### POST `/api/notifications/cron/check-releases`

Checks for new anime/manga releases and creates notifications for users tracking them.

**Schedule:** Daily at 8:00 AM
**Cron expression:** `0 8 * * *`

**Response:**
```json
{
  "success": true,
  "notificationsCreated": 42,
  "message": "Release check completed"
}
```

---

## Stats Endpoint

### GET `/api/jobs/cron/stats`

Returns statistics about job execution.

**Response:**
```json
{
  "success": true,
  "data": {
    "lastDailyRun": "2025-01-24T03:00:00.000Z",
    "lastWeeklyRun": "2025-01-19T04:00:00.000Z",
    "reviewsProcessed": 15234,
    "animesUpdated": 4521,
    "mangasUpdated": 3102
  }
}
```

---

## Cron-Job.org Setup

### Create Jobs

For each endpoint, create a job in [cron-job.org](https://console.cron-job.org/jobs/create):

| Job Title | URL | Method | Schedule |
|-----------|-----|--------|----------|
| Daily Popularity | `/api/jobs/cron/popularity/daily` | POST | `0 3 * * *` |
| Weekly Popularity | `/api/jobs/cron/popularity/weekly` | POST | `0 4 * * 0` |
| Reset Daily Counters | `/api/jobs/cron/counters/reset-daily` | POST | `0 0 * * *` |
| Reset Weekly Counters | `/api/jobs/cron/counters/reset-weekly` | POST | `0 0 * * 1` |
| Reset Monthly Counters | `/api/jobs/cron/counters/reset-monthly` | POST | `0 0 1 * *` |
| Check Releases | `/api/notifications/cron/check-releases` | POST | `0 8 * * *` |

### Headers Configuration

In cron-job.org, add this header to each job:

```
x-cron-api-key: YOUR_CRON_API_KEY
```

### Recommended Settings

- **Request timeout:** 60 seconds (jobs can take a while)
- **Save responses:** Save only failed executions
- **Notifications:** Enable email alerts for failures

---

## Environment Variables

Add to your `.env`:

```env
CRON_API_KEY=your-secure-random-key-here
```

Generate a secure key:
```bash
openssl rand -base64 32
```

---

## Testing Endpoints

Test manually with curl:

```bash
# Daily popularity
curl -X POST "https://ak-api-three.vercel.app/api/jobs/cron/popularity/daily" \
  -H "x-cron-api-key: YOUR_KEY"

# Check releases
curl -X POST "https://ak-api-three.vercel.app/api/notifications/cron/check-releases" \
  -H "x-cron-api-key: YOUR_KEY"

# Get stats
curl "https://ak-api-three.vercel.app/api/jobs/cron/stats" \
  -H "x-cron-api-key: YOUR_KEY"
```

---

## Summary

| Endpoint | Purpose | Schedule |
|----------|---------|----------|
| `POST /jobs/cron/popularity/daily` | Update recent reviews popularity | Daily 3 AM |
| `POST /jobs/cron/popularity/weekly` | Full popularity recalculation | Sunday 4 AM |
| `POST /jobs/cron/counters/reset-daily` | Reset daily view counts | Daily midnight |
| `POST /jobs/cron/counters/reset-weekly` | Reset weekly view counts | Monday midnight |
| `POST /jobs/cron/counters/reset-monthly` | Reset monthly view counts | 1st of month |
| `POST /notifications/cron/check-releases` | Create release notifications | Daily 8 AM |
| `GET /jobs/cron/stats` | View job statistics | On-demand |
