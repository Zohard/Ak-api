# Review Popularity System - Quick Start Guide

## 🚀 Quick Setup

### 1. Database Migration
The system has been set up with the following database changes:
```sql
-- New fields added to ak_critique table
ALTER TABLE ak_critique ADD COLUMN jaime TEXT;      -- CSV of user IDs who liked
ALTER TABLE ak_critique ADD COLUMN jaimepas TEXT;   -- CSV of user IDs who disliked
-- popularite field already existed
```

### 2. Backend Usage

**Like a review:**
```typescript
// POST /reviews/:id/like
const result = await reviewsService.likeReview(reviewId, userId);
// Returns: { liked: boolean, likes: number, dislikes: number, popularite: number }
```

**Get review statistics:**
```typescript
// GET /reviews/:id/stats  
const stats = await reviewsService.getReviewStats(reviewId);
// Returns: ReviewStats with popularity scores, views, engagement data
```

**Batch popularity updates:**
```typescript
// Update popularity for recent reviews (used by scheduled jobs)
const result = await reviewsService.updateAllPopularities(100);
// Returns: { processed: number, successful: number, failed: number }
```

### 3. Frontend Usage

**Add to review card:**
```vue
<template>
  <div class="review-card">
    <h3>{{ review.title }}</h3>
    
    <!-- Add popularity badge -->
    <ReviewPopularity
      :review-id="review.id"
      :show-score="true"
      :show-actions="false"
    />
  </div>
</template>
```

**Add to review detail page:**
```vue
<template>
  <div class="review-detail">
    <h1>{{ review.title }}</h1>
    
    <!-- Full popularity system -->
    <ReviewPopularity
      :review-id="review.id"
      :show-score="true"
      :show-numeric-score="true"
      :show-actions="true"
      :show-stats="true"
      :show-quality="true"
      @liked="onLiked"
      @error="handleError"
    />
  </div>
</template>
```

**Manual API calls:**
```typescript
const { likeReview, getReviewStats } = useReviewPopularity()

// Like a review
const result = await likeReview(reviewId)
console.log(`Review ${result.liked ? 'liked' : 'unliked'}`)

// Get detailed stats  
const stats = await getReviewStats(reviewId)
console.log(`Popularity: ${stats.scores.popularity}/10 (${stats.tier})`)
```

## 🎯 Key Features

### Popularity Tiers
- **Viral (8.0+)** 🔥 - Extremely popular content
- **Très populaire (6.5-7.9)** ⭐ - Very popular content  
- **Populaire (5.0-6.4)** 👑 - Popular content
- **Apprécié (3.5-4.9)** 👍 - Well-liked content
- **En croissance (2.0-3.4)** 📈 - Growing content
- **Nouveau (0-1.9)** ✨ - New content

### Automatic Features
- **View tracking**: Automatically tracks when users view reviews
- **Popularity recalculation**: Updates scores when users like/dislike  
- **Scheduled jobs**: Daily and weekly recalculation of all scores
- **Cache invalidation**: Smart cache updates on interactions

### API Endpoints
- `POST /reviews/:id/like` - Like/unlike review
- `POST /reviews/:id/dislike` - Dislike/undislike review
- `GET /reviews/:id/stats` - Get detailed statistics
- `POST /reviews/:id/view` - Track review view (auto-called)

## 🔧 Testing the System

### 1. Test Like/Dislike
```bash
# Like a review (requires authentication)
curl -X POST http://localhost:3001/reviews/1/like \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Get stats
curl http://localhost:3001/reviews/1/stats
```

### 2. Test Popularity Calculation
```bash
# View a review (increments views and recalculates popularity)
curl -X POST http://localhost:3001/reviews/1/view \
  -H "Content-Type: application/json"

# Check updated stats
curl http://localhost:3001/reviews/1/stats
```

### 3. Frontend Testing
```typescript
// Test in browser console
const { likeReview, getReviewStats } = useReviewPopularity()

// Like review ID 1
likeReview(1).then(result => console.log('Like result:', result))

// Get stats for review ID 1  
getReviewStats(1).then(stats => console.log('Stats:', stats))
```

## 📊 Example Response

```json
{
  "reviewId": 1,
  "likes": 15,
  "dislikes": 2,  
  "totalVotes": 17,
  "likeRatio": 0.88,
  "views": {
    "total": 342,
    "day": 23,
    "week": 156,
    "month": 287
  },
  "scores": {
    "popularity": 7.2,
    "trending": 6.8,
    "quality": 8.1
  },
  "tier": "Très populaire",
  "category": {
    "level": "Très populaire",
    "color": "orange", 
    "icon": "⭐"
  }
}
```

## ⚡ Performance Tips

1. **Use initial stats** when available to avoid extra API calls:
   ```vue
   <ReviewPopularity :initial-stats="review.stats" />
   ```

2. **Debounced view tracking** prevents spam:
   ```typescript
   trackReviewViewDebounced(reviewId) // Only tracks once per session
   ```

3. **Conditional loading** for better performance:
   ```vue
   <ReviewPopularity v-if="showPopularity" />
   ```

## 🎨 Customization

### Custom Popularity Weights
```typescript
// In PopularityService
const customWeights = {
  totalViewsWeight: 0.30,    // Increase view importance
  likesWeight: 0.15,         // Increase like importance  
  recencyWeight: 0.05        // Decrease recency importance
}
```

### Custom Styling
```vue
<style>
.popularity-badge-viral {
  @apply bg-gradient-to-r from-red-500 to-orange-500 text-white;
}

.compact-popularity {
  transform: scale(0.8);
}
</style>
```

## 🔍 Troubleshooting

**Popularity not updating?**
- Check if scheduled jobs are running
- Verify database fields were added correctly
- Manual update: `reviewsService.updateAllPopularities()`

**Like/dislike not working?**
- Ensure user is authenticated
- Check for self-voting (users can't vote on own reviews)
- Verify API endpoints are accessible

**Performance issues?**
- Check cache hit rates
- Monitor database query performance
- Adjust batch sizes in scheduled jobs

## 📈 Monitoring

The system provides built-in monitoring through:
- Job execution logs  
- Cache performance metrics
- API response times
- Error tracking and reporting

Check logs for scheduled job execution and any errors in popularity calculations.

---

The popularity system is now ready to use! It will automatically start calculating popularity scores based on user interactions and views.