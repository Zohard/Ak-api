import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface ActivityAction {
  action: string;
  topic?: number;
  board?: number;
  page?: number;
  [key: string]: any;
}

@Injectable()
export class ActivityTrackerService {
  private readonly logger = new Logger(ActivityTrackerService.name);
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {
    // Clean up old entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Track user or guest activity
   */
  async trackActivity(params: {
    sessionId: string;
    userId?: number;
    ipAddress: string;
    action: ActivityAction;
  }): Promise<void> {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const urlData = JSON.stringify(params.action);

      await this.prisma.smfLogOnline.upsert({
        where: { session: params.sessionId },
        update: {
          logTime: currentTime,
          url: urlData,
          ip: params.ipAddress
        },
        create: {
          session: params.sessionId,
          logTime: currentTime,
          idMember: params.userId || 0,
          idSpider: 0,
          ip: params.ipAddress,
          url: urlData
        }
      });
    } catch (error) {
      this.logger.error('Error tracking activity:', error);
    }
  }

  /**
   * Get list of online users and guests with their activities
   */
  async getOnlineUsers(options: {
    showHidden?: boolean;
    filter?: 'all' | 'members' | 'guests';
    limit?: number;
    offset?: number;
  } = {}): Promise<any> {
    try {
      const {
        showHidden = false,
        filter = 'all',
        limit = 50,
        offset = 0
      } = options;

      const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60);

      // Build where clause
      const whereClause: any = {
        logTime: {
          gte: fifteenMinutesAgo
        }
      };

      if (filter === 'members') {
        whereClause.idMember = { not: 0 };
      } else if (filter === 'guests') {
        whereClause.idMember = 0;
      }

      // Get online entries
      const [onlineEntries, totalCount] = await Promise.all([
        this.prisma.smfLogOnline.findMany({
          where: whereClause,
          orderBy: {
            logTime: 'desc'
          },
          take: limit,
          skip: offset
        }),
        this.prisma.smfLogOnline.count({
          where: whereClause
        })
      ]);

      // Get unique member IDs to fetch
      const memberIds = [...new Set(onlineEntries.filter(e => e.idMember > 0).map(e => e.idMember))];

      // Fetch member data if needed
      const members = memberIds.length > 0 ? await this.prisma.smfMember.findMany({
        where: {
          idMember: {
            in: memberIds
          }
        },
        include: {
          membergroup: true
        }
      }) : [];

      // Create a map for quick lookup
      const memberMap = new Map(members.map(m => [m.idMember, m]));

      // Process entries
      const users: any[] = [];
      let guestCount = 0;

      for (const entry of onlineEntries) {
        // Parse activity action
        let action: ActivityAction;
        try {
          action = JSON.parse(entry.url);
        } catch {
          action = { action: 'unknown' };
        }

        if (entry.idMember === 0) {
          // Guest
          guestCount++;
          users.push({
            session: entry.session,
            isGuest: true,
            username: 'Invité',
            realName: 'Invité',
            time: entry.logTime,
            ip: entry.ip,
            action: this.formatAction(action),
            actionRaw: action
          });
        } else {
          const member = memberMap.get(entry.idMember);
          if (member) {
            // Registered member
            // Skip hidden users if not showing them
            if (!showHidden && !member.lastLogin) {
              continue;
            }

            users.push({
              session: entry.session,
              isGuest: false,
              id: member.idMember,
              username: member.memberName,
              realName: member.realName || member.memberName,
              avatar: member.avatar,
              group: {
                id: member.idGroup,
                name: member.membergroup?.groupName || 'Member',
                color: member.membergroup?.onlineColor || null
              },
              time: entry.logTime,
              ip: entry.ip,
              action: this.formatAction(action),
              actionRaw: action
            });
          }
        }
      }

      // Count unique members
      const memberCount = users.filter(u => !u.isGuest).length;

      return {
        users,
        stats: {
          totalOnline: users.length,
          members: memberCount,
          guests: guestCount,
          totalCount
        },
        pagination: {
          limit,
          offset,
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    } catch (error) {
      this.logger.error('Error getting online users:', error);
      return {
        users: [],
        stats: {
          totalOnline: 0,
          members: 0,
          guests: 0,
          totalCount: 0
        },
        pagination: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          totalPages: 0
        }
      };
    }
  }

  /**
   * Get online statistics (for homepage widget)
   */
  async getOnlineStats(): Promise<any> {
    try {
      const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60);

      const onlineEntries = await this.prisma.smfLogOnline.findMany({
        where: {
          logTime: {
            gte: fifteenMinutesAgo
          }
        }
      });

      // Get unique member IDs to fetch
      const memberIds = [...new Set(onlineEntries.filter(e => e.idMember > 0).map(e => e.idMember))];

      // Fetch member data if needed
      const membersData = memberIds.length > 0 ? await this.prisma.smfMember.findMany({
        where: {
          idMember: {
            in: memberIds
          }
        },
        include: {
          membergroup: true
        }
      }) : [];

      // Create a map for quick lookup
      const memberMap = new Map(membersData.map(m => [m.idMember, m]));

      const members: any[] = [];
      let guestCount = 0;

      for (const entry of onlineEntries) {
        if (entry.idMember === 0) {
          guestCount++;
        } else {
          const member = memberMap.get(entry.idMember);
          if (member) {
            members.push({
              id: member.idMember,
              username: member.memberName,
              realName: member.realName || member.memberName,
              avatar: member.avatar,
              group: {
                name: member.membergroup?.groupName || 'Member',
                color: member.membergroup?.onlineColor || null
              }
            });
          }
        }
      }

      // Remove duplicates (same user with multiple sessions)
      const uniqueMembers = members.filter((member, index, self) =>
        index === self.findIndex((m) => m.id === member.id)
      );

      return {
        totalOnline: uniqueMembers.length + guestCount,
        members: uniqueMembers,
        memberCount: uniqueMembers.length,
        guestCount: guestCount
      };
    } catch (error) {
      this.logger.error('Error getting online stats:', error);
      return {
        totalOnline: 0,
        members: [],
        memberCount: 0,
        guestCount: 0
      };
    }
  }

  /**
   * Format action for display
   */
  private formatAction(action: ActivityAction): string {
    switch (action.action) {
      case 'home':
      case 'homepage':
        return 'Sur le site';

      case 'forum_index':
      case 'forums':
        return 'Regarde les forums';

      case 'forum_board':
        return action.board ? `Regarde le forum #${action.board}` : 'Regarde un forum';

      case 'forum_topic':
        return action.topic ? `Lit le sujet #${action.topic}` : 'Lit un sujet';

      case 'who_online':
      case 'online':
        return 'Regarde Qui est en ligne';

      case 'profile':
        return action.userId ? `Regarde le profil de l'utilisateur #${action.userId}` : 'Regarde un profil';

      case 'anime':
        return action.animeId ? `Regarde l'anime #${action.animeId}` : 'Regarde un anime';

      case 'manga':
        return action.mangaId ? `Regarde le manga #${action.mangaId}` : 'Regarde un manga';

      case 'search':
        return 'Effectue une recherche';

      case 'login':
        return 'Se connecte';

      case 'logout':
        return 'Se déconnecte';

      default:
        return 'Sur le site';
    }
  }

  /**
   * Clean up entries older than 15 minutes
   */
  private async cleanupOldEntries(): Promise<void> {
    try {
      const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60);

      const result = await this.prisma.smfLogOnline.deleteMany({
        where: {
          logTime: {
            lt: fifteenMinutesAgo
          }
        }
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} old activity entries`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up old entries:', error);
    }
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
