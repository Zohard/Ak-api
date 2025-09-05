import { Injectable } from '@nestjs/common';

export interface PopularityFactors {
  // View-based metrics
  totalViews?: number;
  recentViews?: number; // views in last 7 days
  viewsGrowthRate?: number; // growth rate in views

  // Rating/interaction metrics
  averageRating?: number;
  ratingCount?: number;
  likes?: number;
  dislikes?: number;

  // Quality metrics
  reviewLength?: number; // character count of review
  hasImages?: boolean;

  // Recency factor
  ageInDays?: number;
  
  // Author influence
  authorReputation?: number; // author's average review rating
}

export interface PopularityWeights {
  // View weights
  totalViewsWeight: number;
  recentViewsWeight: number;
  viewsGrowthWeight: number;

  // Rating weights
  averageRatingWeight: number;
  ratingCountWeight: number;
  likesWeight: number;
  dislikesWeight: number;

  // Quality weights
  lengthWeight: number;
  imageWeight: number;

  // Time decay
  recencyWeight: number;

  // Author influence
  authorWeight: number;
}

@Injectable()
export class PopularityService {
  
  // Default weights for popularity calculation
  private readonly defaultWeights: PopularityWeights = {
    totalViewsWeight: 0.25,      // 25% - Total views
    recentViewsWeight: 0.20,     // 20% - Recent activity
    viewsGrowthWeight: 0.10,     // 10% - Growth momentum
    
    averageRatingWeight: 0.15,   // 15% - Quality rating
    ratingCountWeight: 0.05,     // 5% - Rating engagement
    likesWeight: 0.10,           // 10% - Positive feedback
    dislikesWeight: -0.05,       // -5% - Negative feedback penalty
    
    lengthWeight: 0.05,          // 5% - Content quality
    imageWeight: 0.02,           // 2% - Visual content bonus
    
    recencyWeight: 0.08,         // 8% - Time decay
    authorWeight: 0.05           // 5% - Author reputation
  };

  /**
   * Calculate popularity score using multiple factors
   */
  calculatePopularity(factors: PopularityFactors, weights: Partial<PopularityWeights> = {}): number {
    const w = { ...this.defaultWeights, ...weights };
    let score = 0;

    // Views component (normalized logarithmically)
    if (factors.totalViews !== undefined) {
      const viewsScore = Math.log(factors.totalViews + 1) / 10; // Normalize to 0-1 range
      score += viewsScore * w.totalViewsWeight;
    }

    // Recent views component
    if (factors.recentViews !== undefined) {
      const recentScore = Math.log(factors.recentViews + 1) / 8; // More weight on recent activity
      score += recentScore * w.recentViewsWeight;
    }

    // Views growth rate
    if (factors.viewsGrowthRate !== undefined) {
      const growthScore = Math.min(factors.viewsGrowthRate, 2); // Cap at 200% growth
      score += growthScore * w.viewsGrowthWeight;
    }

    // Rating component
    if (factors.averageRating !== undefined) {
      const ratingScore = factors.averageRating / 10; // Assuming 10 is max rating
      score += ratingScore * w.averageRatingWeight;
    }

    // Rating engagement
    if (factors.ratingCount !== undefined) {
      const engagementScore = Math.log(factors.ratingCount + 1) / 5;
      score += engagementScore * w.ratingCountWeight;
    }

    // Like/dislike system
    if (factors.likes !== undefined && factors.dislikes !== undefined) {
      const totalVotes = factors.likes + factors.dislikes;
      if (totalVotes > 0) {
        const likeRatio = factors.likes / totalVotes;
        score += likeRatio * w.likesWeight;
        score += (factors.dislikes / totalVotes) * w.dislikesWeight; // Penalty for dislikes
      }
    }

    // Content quality (length)
    if (factors.reviewLength !== undefined) {
      // Optimal length around 500-2000 characters
      const lengthScore = this.calculateLengthScore(factors.reviewLength);
      score += lengthScore * w.lengthWeight;
    }

    // Visual content bonus
    if (factors.hasImages) {
      score += 0.1 * w.imageWeight; // 10% bonus for having images
    }

    // Recency factor (time decay)
    if (factors.ageInDays !== undefined) {
      const recencyScore = this.calculateRecencyScore(factors.ageInDays);
      score += recencyScore * w.recencyWeight;
    }

    // Author reputation
    if (factors.authorReputation !== undefined) {
      const authorScore = factors.authorReputation / 10; // Normalize author rating
      score += authorScore * w.authorWeight;
    }

    // Ensure score is between 0 and 10
    return Math.max(0, Math.min(10, score * 10));
  }

  /**
   * Simple popularity calculation similar to the lists system
   */
  calculateSimplePopularity(
    likes: number = 0, 
    dislikes: number = 0, 
    views: number = 0, 
    rating: number = 0,
    ratingCount: number = 0
  ): number {
    const totalVotes = likes + dislikes;
    const likeRatio = totalVotes > 0 ? likes / totalVotes : 0;
    const viewsWeight = Math.log(views + 1) / 10; // Logarithmic views weight
    const ratingWeight = ratingCount > 0 ? (rating / 10) * Math.log(ratingCount + 1) / 5 : 0;

    // Weighted combination: 40% likes, 35% views, 25% rating quality
    const popularity = (likeRatio * 0.4) + (viewsWeight * 0.35) + (ratingWeight * 0.25);
    
    return Number(popularity.toFixed(4));
  }

  /**
   * Calculate trending score for recently popular content
   */
  calculateTrendingScore(factors: PopularityFactors): number {
    let trendingScore = 0;

    // Heavy emphasis on recent activity
    if (factors.recentViews && factors.totalViews) {
      const recentRatio = factors.recentViews / factors.totalViews;
      trendingScore += recentRatio * 0.4; // 40% weight
    }

    // Views growth rate
    if (factors.viewsGrowthRate) {
      trendingScore += Math.min(factors.viewsGrowthRate, 3) * 0.3; // 30% weight, cap at 300%
    }

    // Recent engagement
    if (factors.likes && factors.ageInDays) {
      const dailyLikes = factors.likes / Math.max(factors.ageInDays, 1);
      trendingScore += Math.log(dailyLikes + 1) * 0.2; // 20% weight
    }

    // Recency bonus
    if (factors.ageInDays !== undefined) {
      const recencyBonus = Math.max(0, 1 - (factors.ageInDays / 30)); // Boost for content < 30 days
      trendingScore += recencyBonus * 0.1; // 10% weight
    }

    return Math.max(0, Math.min(10, trendingScore * 10));
  }

  /**
   * Calculate quality score based on content characteristics
   */
  calculateQualityScore(factors: PopularityFactors): number {
    let qualityScore = 0;

    // Rating quality
    if (factors.averageRating && factors.ratingCount) {
      const ratingScore = (factors.averageRating / 10) * Math.log(factors.ratingCount + 1) / 5;
      qualityScore += ratingScore * 0.5; // 50% weight
    }

    // Content length (sweet spot around 500-2000 chars)
    if (factors.reviewLength) {
      qualityScore += this.calculateLengthScore(factors.reviewLength) * 0.3; // 30% weight
    }

    // Visual content
    if (factors.hasImages) {
      qualityScore += 0.1; // 10% bonus
    }

    // Author reputation
    if (factors.authorReputation) {
      qualityScore += (factors.authorReputation / 10) * 0.1; // 10% weight
    }

    return Math.max(0, Math.min(10, qualityScore * 10));
  }

  /**
   * Calculate length score with optimal range
   */
  private calculateLengthScore(length: number): number {
    if (length < 100) return 0.2; // Too short
    if (length < 300) return 0.5; // Short but acceptable
    if (length < 500) return 0.7; // Good length
    if (length < 1000) return 1.0; // Optimal length
    if (length < 2000) return 0.9; // Still good
    if (length < 3000) return 0.7; // Getting long
    return 0.5; // Too long
  }

  /**
   * Calculate recency score with time decay
   */
  private calculateRecencyScore(ageInDays: number): number {
    if (ageInDays < 1) return 1.0;     // Brand new
    if (ageInDays < 7) return 0.9;     // Very recent
    if (ageInDays < 30) return 0.7;    // Recent
    if (ageInDays < 90) return 0.5;    // Somewhat old
    if (ageInDays < 180) return 0.3;   // Old
    if (ageInDays < 365) return 0.2;   // Very old
    return 0.1; // Ancient
  }

  /**
   * Get popularity tier based on score
   */
  getPopularityTier(score: number): string {
    if (score >= 8) return 'Viral';
    if (score >= 6.5) return 'Très populaire';
    if (score >= 5) return 'Populaire';
    if (score >= 3.5) return 'Modérément populaire';
    if (score >= 2) return 'En croissance';
    return 'Nouveau';
  }

  /**
   * Get popularity category for display
   */
  getPopularityCategory(score: number): {
    level: string;
    color: string;
    icon: string;
  } {
    if (score >= 8) {
      return { level: 'Viral', color: 'red', icon: '🔥' };
    } else if (score >= 6.5) {
      return { level: 'Très populaire', color: 'orange', icon: '⭐' };
    } else if (score >= 5) {
      return { level: 'Populaire', color: 'yellow', icon: '👑' };
    } else if (score >= 3.5) {
      return { level: 'Apprécié', color: 'green', icon: '👍' };
    } else if (score >= 2) {
      return { level: 'En croissance', color: 'blue', icon: '📈' };
    } else {
      return { level: 'Nouveau', color: 'gray', icon: '✨' };
    }
  }
}