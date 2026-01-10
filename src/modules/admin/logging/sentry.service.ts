import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  level: string;
  status: string;
  isPublic: boolean;
  project: {
    id: string;
    name: string;
    slug: string;
  };
}

interface SentryStats {
  totalIssues: number;
  newToday: number;
  resolvedToday: number;
}

@Injectable()
export class SentryService {
  private readonly logger = new Logger(SentryService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get access token using OAuth client credentials
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const clientId = this.configService.get<string>('SENTRY_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SENTRY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('Sentry OAuth credentials not configured');
    }

    try {
      // Use client credentials grant type
      const response = await fetch('https://sentry.io/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to get Sentry access token: ${response.status} ${error}`);
        throw new UnauthorizedException('Failed to authenticate with Sentry');
      }

      const data = await response.json();
      this.accessToken = data.access_token;

      // Set expiry (typically 1 hour, subtract 5 minutes for safety)
      const expiresIn = data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);

      return this.accessToken;
    } catch (error) {
      this.logger.error('Error getting Sentry access token:', error);
      throw new UnauthorizedException('Failed to authenticate with Sentry');
    }
  }

  /**
   * Fetch issues from Sentry API
   */
  async getIssues(params: {
    limit?: number;
    query?: string;
    statsPeriod?: string;
    status?: string;
  }): Promise<SentryIssue[]> {
    const token = await this.getAccessToken();
    const orgSlug = this.configService.get<string>('SENTRY_ORG_SLUG') || 'anime-kun';

    const queryParams = new URLSearchParams({
      limit: String(params.limit || 25),
      statsPeriod: params.statsPeriod || '24h',
    });

    if (params.query) {
      queryParams.append('query', params.query);
    }

    if (params.status) {
      queryParams.append('query', `is:${params.status}`);
    }

    try {
      const response = await fetch(
        `https://sentry.io/api/0/organizations/${orgSlug}/issues/?${queryParams}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to fetch Sentry issues: ${response.status} ${error}`);
        throw new Error('Failed to fetch issues from Sentry');
      }

      const issues = await response.json();
      return issues;
    } catch (error) {
      this.logger.error('Error fetching Sentry issues:', error);
      throw error;
    }
  }

  /**
   * Get issue statistics
   */
  async getStats(): Promise<SentryStats> {
    try {
      const allIssues = await this.getIssues({ limit: 100, statsPeriod: '24h' });

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const newToday = allIssues.filter(issue => {
        const firstSeen = new Date(issue.firstSeen);
        return firstSeen >= today;
      }).length;

      const resolvedToday = allIssues.filter(issue => {
        const lastSeen = new Date(issue.lastSeen);
        return issue.status === 'resolved' && lastSeen >= today;
      }).length;

      return {
        totalIssues: allIssues.length,
        newToday,
        resolvedToday,
      };
    } catch (error) {
      this.logger.error('Error fetching Sentry stats:', error);
      return {
        totalIssues: 0,
        newToday: 0,
        resolvedToday: 0,
      };
    }
  }

  /**
   * Get issue details by ID
   */
  async getIssueDetails(issueId: string): Promise<any> {
    const token = await this.getAccessToken();
    const orgSlug = this.configService.get<string>('SENTRY_ORG_SLUG') || 'anime-kun';

    try {
      const response = await fetch(
        `https://sentry.io/api/0/organizations/${orgSlug}/issues/${issueId}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to fetch Sentry issue details: ${response.status} ${error}`);
        throw new Error('Failed to fetch issue details from Sentry');
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error fetching Sentry issue details:', error);
      throw error;
    }
  }

  /**
   * Check if Sentry integration is configured
   */
  isConfigured(): boolean {
    const clientId = this.configService.get<string>('SENTRY_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SENTRY_CLIENT_SECRET');
    return !!(clientId && clientSecret);
  }
}
