import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SentryIssue {
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

export interface SentryStats {
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
   * Get access token using OAuth client credentials or auth token
   */
  private async getAccessToken(): Promise<string> {
    // Check if using auth token instead of OAuth
    const authToken = this.configService.get<string>('SENTRY_AUTH_TOKEN');
    if (authToken) {
      return authToken;
    }

    // Return cached OAuth token if still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const clientId = this.configService.get<string>('SENTRY_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SENTRY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('Sentry credentials not configured. Set either SENTRY_AUTH_TOKEN or SENTRY_CLIENT_ID/SENTRY_CLIENT_SECRET');
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
    try {
      const token = await this.getAccessToken();
      const orgSlug = this.configService.get<string>('SENTRY_ORG_SLUG') || 'anime-kun';

      this.logger.log(`Fetching Sentry issues for org: ${orgSlug}`);

      // Build the query filter by combining query and status
      const queryFilters: string[] = [];
      if (params.query) {
        queryFilters.push(params.query);
      }
      if (params.status) {
        queryFilters.push(`is:${params.status}`);
      }

      const queryParams = new URLSearchParams({
        limit: String(params.limit || 25),
        statsPeriod: params.statsPeriod || '24h',
      });

      // Add combined query filter if any filters exist
      if (queryFilters.length > 0) {
        queryParams.set('query', queryFilters.join(' '));
      }

      const url = `https://sentry.io/api/0/organizations/${orgSlug}/issues/?${queryParams}`;
      this.logger.log(`Making request to: ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Sentry API error - Status: ${response.status}, Body: ${errorText}`);

        // Return empty array instead of throwing for better UX
        return [];
      }

      const issues = await response.json();
      this.logger.log(`Successfully fetched ${issues.length} issues from Sentry`);
      return issues;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching Sentry issues: ${errorMessage}`, error);

      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  /**
   * Get issue statistics
   */
  async getStats(): Promise<SentryStats> {
    try {
      const allIssues = await this.getIssues({ limit: 100, statsPeriod: '24h' });

      if (!allIssues || allIssues.length === 0) {
        this.logger.log('No issues found in Sentry');
        return {
          totalIssues: 0,
          newToday: 0,
          resolvedToday: 0,
        };
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const newToday = allIssues.filter(issue => {
        try {
          const firstSeen = new Date(issue.firstSeen);
          return firstSeen >= today;
        } catch {
          return false;
        }
      }).length;

      const resolvedToday = allIssues.filter(issue => {
        try {
          const lastSeen = new Date(issue.lastSeen);
          return issue.status === 'resolved' && lastSeen >= today;
        } catch {
          return false;
        }
      }).length;

      return {
        totalIssues: allIssues.length,
        newToday,
        resolvedToday,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching Sentry stats: ${errorMessage}`, error);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching Sentry issue details: ${errorMessage}`, error);
      throw error;
    }
  }

  /**
   * Check if Sentry integration is configured
   */
  isConfigured(): boolean {
    const authToken = this.configService.get<string>('SENTRY_AUTH_TOKEN');
    if (authToken) {
      return true;
    }
    const clientId = this.configService.get<string>('SENTRY_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SENTRY_CLIENT_SECRET');
    return !!(clientId && clientSecret);
  }
}
