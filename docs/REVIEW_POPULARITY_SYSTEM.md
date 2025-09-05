# Review Popularity System Documentation

## Overview

The Review Popularity System is a comprehensive solution for calculating, tracking, and displaying popularity metrics for user reviews. It combines multiple factors including views, user engagement (likes/dislikes), content quality, and temporal relevance to provide meaningful popularity scores.

## System Architecture

### Backend Components

#### 1. PopularityService (`src/shared/services/popularity.service.ts`)

The core service responsible for popularity calculations using sophisticated algorithms.

**Key Features:**
- Multi-factor popularity scoring
- Trending content detection
- Quality assessment based on content characteristics
- Configurable weight system for different factors

**Popularity Factors:**
- **Views (55% weight total)**
  - Total views (25%)
  - Recent views (20%) 
  - Views growth rate (10%)
- **Engagement (30% weight total)**
  - Average rating (15%)
  - Like/dislike ratio (10%)
  - Rating engagement (5%)
- **Content Quality (15% weight total)**
  - Review length optimization (5%)
  - Visual content bonus (2%)
  - Recency factor (8%)

#### 2. Enhanced ReviewsService (`src/modules/reviews/reviews.service.ts`)

Extended with popularity and engagement methods.

**New Methods:**
- `likeReview(reviewId, userId)` - Like/unlike functionality
- `dislikeReview(reviewId, userId)` - Dislike functionality  
- `getReviewStats(reviewId)` - Comprehensive statistics
- `calculateReviewPopularity(reviewId)` - Popularity calculation
- `updateAllPopularities(limit)` - Batch popularity updates

#### 3. PopularityJobService (`src/modules/jobs/popularity-job.service.ts`)

Automated job system for maintaining popularity calculations.

**Scheduled Jobs:**
- **Daily (2:00 AM)**: Recalculate popularity for recent reviews (last 7 days)
- **Weekly (Sunday 3:00 AM)**: Full popularity recalculation for all reviews
- **Hourly**: Reset daily view counters (at midnight)
- **Weekly (Monday midnight)**: Reset weekly view counters
- **Monthly (1st day midnight)**: Reset monthly view counters

#### 4. Database Schema Updates

**AkCritique Model Extensions:**
```prisma
model AkCritique {
  // ... existing fields
  popularite   Float?    @db.Real              // Calculated popularity score
  jaime        String?   @db.Text              // CSV of user IDs who liked
  jaimepas     String?   @db.Text              // CSV of user IDs who disliked
  // ... existing fields
}
```

### API Endpoints

#### Like/Dislike System
- `POST /reviews/:id/like` - Toggle like for a review
- `POST /reviews/:id/dislike` - Toggle dislike for a review
- `GET /reviews/:id/stats` - Get detailed review statistics

#### Response Format
```typescript
interface ReviewStats {
  reviewId: number
  likes: number
  dislikes: number
  totalVotes: number
  likeRatio: number
  views: {
    total: number
    day: number
    week: number
    month: number
  }
  scores: {
    popularity: number    // 0-10 scale
    trending: number     // 0-10 scale
    quality: number      // 0-10 scale
  }
  tier: string          // "Viral", "Très populaire", etc.
  category: {
    level: string
    color: string
    icon: string
  }
}
```

### Frontend Components

#### 1. ReviewPopularity Component (`components/reviews/ReviewPopularity.vue`)

Interactive popularity display and engagement component.

**Props:**
- `reviewId` - Review identifier
- `showScore` - Display popularity badge
- `showActions` - Show like/dislike buttons
- `showStats` - Show detailed statistics
- `showQuality` - Show quality indicators
- `isOwnReview` - Disable voting for own reviews

**Features:**
- Real-time like/dislike interactions
- Popularity tier badges with icons
- Trending indicators
- Quality star ratings
- Optimistic UI updates

#### 2. useReviewPopularity Composable (`composables/useReviewPopularity.ts`)

Reactive composable for popularity API interactions.

**Methods:**
- `likeReview(reviewId)` - Like a review
- `dislikeReview(reviewId)` - Dislike a review
- `getReviewStats(reviewId)` - Fetch review statistics
- `formatPopularityScore(score)` - Format score for display
- `getPopularityBadge(score)` - Get badge configuration

#### 3. useClickTracking Composable (`composables/useClickTracking.ts`)

Handles view tracking for popularity calculations.

**Methods:**
- `trackReviewView(reviewId)` - Track single view
- `trackReviewViewDebounced(reviewId)` - Debounced tracking (once per session)

## Popularity Algorithm Details

### Scoring Formula

The base popularity score (0-10 scale) is calculated as:

```
popularity = (
  (views_score * 0.25) +
  (recent_views_score * 0.20) +
  (rating_score * 0.15) +
  (like_ratio * 0.10) +
  (growth_rate * 0.10) +
  (length_quality * 0.05) +
  (recency_bonus * 0.08) +
  (author_reputation * 0.05) +
  (engagement_count * 0.02)
) * 10
```

### Popularity Tiers

| Score Range | Tier | Icon | Description |
|------------|------|------|-------------|
| 8.0+ | Viral | 🔥 | Extremely popular content |
| 6.5-7.9 | Très populaire | ⭐ | Very popular content |
| 5.0-6.4 | Populaire | 👑 | Popular content |
| 3.5-4.9 | Apprécié | 👍 | Well-liked content |
| 2.0-3.4 | En croissance | 📈 | Growing content |
| 0-1.9 | Nouveau | ✨ | New content |

### Quality Scoring Factors

1. **Content Length Optimization**
   - Sweet spot: 500-2000 characters
   - Penalty for too short (<100 chars) or too long (>3000 chars)

2. **Recency Decay**
   - New content (0-7 days): 100% boost
   - Recent (7-30 days): 70% boost  
   - Older content gradually decreases

3. **Engagement Quality**
   - High like ratio with significant vote count
   - Balanced engagement over time

## Integration Examples

### Basic Usage in Components

```vue
<template>
  <ReviewPopularity
    :review-id="review.id"
    :show-score="true"
    :show-actions="true"
    @liked="onReviewLiked"
    @error="handleError"
  />
</template>
```

### Advanced Statistics Display

```vue
<template>
  <ReviewPopularity
    :review-id="review.id"
    :show-score="true"
    :show-numeric-score="true" 
    :show-actions="true"
    :show-stats="true"
    :show-quality="true"
    :is-own-review="isAuthor"
  />
</template>
```

### Manual API Usage

```typescript
const { likeReview, getReviewStats } = useReviewPopularity()

// Like a review
const result = await likeReview(reviewId)
console.log(`Review ${result.liked ? 'liked' : 'unliked'}`)

// Get detailed stats
const stats = await getReviewStats(reviewId)
console.log(`Popularity: ${stats.scores.popularity}/10`)
```

## Performance Considerations

### Caching Strategy
- **Individual reviews**: 10-minute cache TTL
- **Review lists**: 2-5 minute cache TTL
- **Top reviews**: 15-minute cache TTL
- Cache invalidation on popularity updates

### Batch Processing
- Popularity recalculation in batches of 100 reviews
- 1-second delays between batches to prevent database overload
- Failed updates tracked and reported

### Database Optimization
- Indexed fields: `popularite`, `nbClics`, `jaime`, `jaimepas`
- Efficient CSV parsing for like/dislike data
- Selective field updates to minimize query overhead

## Security & Privacy

### Voting Rules
- Users cannot vote on their own reviews
- One vote per user per review (toggle mechanism)
- Authentication required for voting
- Rate limiting on API endpoints

### Data Protection
- User voting data stored as CSV (space efficient)
- No individual vote tracking in logs
- Privacy-friendly analytics aggregation

## Monitoring & Analytics

### Available Metrics
- Average popularity scores across all reviews
- Distribution of popularity tiers
- Trending content identification
- User engagement patterns
- System performance metrics

### Health Checks
- Job execution monitoring
- Cache hit rate tracking
- API response time monitoring
- Error rate tracking for popularity operations

## Troubleshooting

### Common Issues

1. **Popularity not updating**
   - Check scheduled jobs are running
   - Verify cache invalidation
   - Manual recalculation via `updateAllPopularities()`

2. **Like/dislike not working**
   - Ensure user authentication
   - Check for self-voting prevention
   - Verify API endpoint connectivity

3. **Performance issues**
   - Monitor batch job execution times
   - Check database query performance
   - Adjust cache TTL settings

### Manual Operations

```typescript
// Force recalculate all popularities
await reviewsService.updateAllPopularities(1000)

// Get job statistics
await popularityJobService.getJobStats()

// Manual popularity calculation for specific review
await popularityJobService.recalculateReviewPopularity(reviewId)
```

## Future Enhancements

### Planned Features
- Machine learning-based quality detection
- User preference-based personalized popularity
- Collaborative filtering for similar content
- Advanced analytics dashboard
- A/B testing for algorithm parameters

### Scalability Improvements
- Redis-based caching layer
- Event-driven popularity updates
- Distributed job processing
- Real-time popularity streaming

---

## Configuration

### Environment Variables
```env
# Job scheduling (optional, uses defaults if not set)
POPULARITY_JOB_DAILY_CRON=0 2 * * *
POPULARITY_JOB_WEEKLY_CRON=0 3 * * 0
POPULARITY_JOB_BATCH_SIZE=100

# Cache settings
POPULARITY_CACHE_TTL=600
REVIEWS_LIST_CACHE_TTL=180
```

### Custom Weights Configuration
```typescript
// Custom popularity weights
const customWeights: PopularityWeights = {
  totalViewsWeight: 0.30,     // Increase view importance
  likesWeight: 0.15,          // Increase like importance
  recencyWeight: 0.05,        // Decrease recency importance
  // ... other weights
}

popularityService.calculatePopularity(factors, customWeights)
```

This system provides a robust, scalable solution for review popularity that enhances user engagement while maintaining performance and reliability.