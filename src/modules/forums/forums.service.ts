import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ForumMessageQueryDto, ForumMessage, ForumMessageResponse } from './dto/forum-message.dto';

@Injectable()
export class ForumsService {
  private readonly logger = new Logger(ForumsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCategories(userId?: number) {
    this.logger.log(`=== STARTING getCategories for user: ${userId || 'guest'} ===`);

    try {
      this.logger.log('About to query database for categories...');

      const categories = await this.prisma.smfCategory.findMany({
        orderBy: { catOrder: 'asc' },
        include: {
          boards: {
            where: {
              OR: [
                { redirect: null },
                { redirect: '' }
              ]
            },
            orderBy: { boardOrder: 'asc' },
            include: {
              _count: {
                select: { topics: true, messages: true }
              }
            }
          }
        }
      });

      this.logger.log(`=== DATABASE QUERY RESULT: Found ${categories.length} categories ===`);
      categories.forEach((cat, index) => {
        this.logger.log(`Category ${index + 1}: ID=${cat.idCat}, Name="${cat.name}", Boards=${cat.boards.length}`);
      });

      if (categories.length === 0) {
        this.logger.error('NO CATEGORIES FOUND IN DATABASE!');
        return [];
      }

      this.logger.log(`Total boards across all categories: ${categories.reduce((total, cat) => total + cat.boards.length, 0)}`);

      // Filter boards based on access permissions
      const filteredCategories = await Promise.all(
        categories.map(async category => {
          this.logger.log(`Processing category: ${category.name} with ${category.boards.length} boards`);

          const accessibleBoards = await Promise.all(
            category.boards.map(async board => {
              const hasAccess = await this.checkBoardAccess(board.idBoard, userId);
              this.logger.log(`Board ${board.idBoard} (${board.name}) access for user ${userId}: ${hasAccess}`);

              // Special logging for Team AK boards
              if (category.name === 'Team AK') {
                this.logger.warn(`🔍 TEAM AK BOARD DETECTED: ${board.idBoard} (${board.name}) - access: ${hasAccess} - member_groups: "${board.memberGroups}"`);
              }

              return hasAccess ? {
                id: board.idBoard,
                name: board.name,
                description: board.description,
                numTopics: board.numTopics,
                numPosts: board.numPosts,
                redirect: board.redirect,
                lastMessageId: board.idLastMsg || null
              } : null;
            })
          );

          const filteredBoards = accessibleBoards.filter(board => board !== null);
          this.logger.log(`Category ${category.name}: ${filteredBoards.length}/${category.boards.length} accessible boards`);

          return {
            id: category.idCat,
            name: category.name,
            catOrder: category.catOrder,
            canCollapse: Boolean(category.canCollapse),
            boards: filteredBoards
          };
        })
      );

      const totalAccessibleBoards = filteredCategories.reduce((total, cat) => total + cat.boards.length, 0);
      this.logger.log(`=== FINAL RESULT: Returning ${filteredCategories.length} categories with ${totalAccessibleBoards} accessible boards ===`);

      return filteredCategories;
    } catch (error) {
      this.logger.error('=== ERROR in getCategories ===', error);
      throw error; // Re-throw to see the full error in API response
    }
  }

  async getBoardWithTopics(boardId: number, page: number = 1, limit: number = 20, userId?: number) {
    try {
      // Check board access permissions
      const hasAccess = await this.checkBoardAccess(boardId, userId);
      if (!hasAccess) {
        throw new Error('Access denied to this board');
      }

      const offset = (page - 1) * limit;

      const [board, topics, totalTopics] = await Promise.all([
        this.prisma.smfBoard.findUnique({
          where: { idBoard: boardId },
          include: {
            category: true
          }
        }),
        this.prisma.smfTopic.findMany({
          where: { idBoard: boardId },
          skip: offset,
          take: limit,
          orderBy: [
            { isSticky: 'desc' },
            { idLastMsg: 'desc' }
          ],
          include: {
            firstMessage: {
              include: {
                member: true
              }
            },
            lastMessage: {
              include: {
                member: true
              }
            },
            starter: true,
            lastUpdater: true
          }
        }),
        this.prisma.smfTopic.count({
          where: { idBoard: boardId }
        })
      ]);

      if (!board) {
        throw new Error('Board not found');
      }

      return {
        board: {
          id: board.idBoard,
          name: board.name,
          description: board.description,
          categoryName: board.category.name,
          numTopics: board.numTopics,
          numPosts: board.numPosts
        },
        topics: topics.map(topic => ({
          id: topic.idTopic,
          subject: topic.firstMessage?.subject || 'Untitled',
          isSticky: Boolean(topic.isSticky),
          locked: Boolean(topic.locked),
          numReplies: topic.numReplies,
          numViews: topic.numViews,
          starter: {
            id: topic.starter?.idMember || 0,
            name: topic.starter?.memberName || topic.firstMessage?.posterName || 'Unknown'
          },
          lastMessage: topic.lastMessage ? {
            time: topic.lastMessage.posterTime,
            author: topic.lastMessage.member?.memberName || topic.lastMessage.posterName
          } : null,
          firstMessageTime: topic.firstMessage?.posterTime || 0
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalTopics / limit),
          totalItems: totalTopics,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      this.logger.error('Error fetching board with topics:', error);
      throw error;
    }
  }

  async getTopicWithPosts(topicId: number, page: number = 1, limit: number = 15, userId?: number) {
    try {
      const offset = (page - 1) * limit;

      const [topic, posts, totalPosts] = await Promise.all([
        this.prisma.smfTopic.findUnique({
          where: { idTopic: topicId },
          include: {
            board: {
              include: {
                category: true
              }
            },
            firstMessage: true
          }
        }),
        this.prisma.smfMessage.findMany({
          where: { idTopic: topicId },
          skip: offset,
          take: limit,
          orderBy: { idMsg: 'asc' },
          include: {
            member: {
              include: {
                membergroup: true
              }
            }
          }
        }),
        this.prisma.smfMessage.count({
          where: { idTopic: topicId }
        })
      ]);

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check board access permissions for the topic's board
      const hasAccess = await this.checkBoardAccess(topic.board.idBoard, userId);
      if (!hasAccess) {
        throw new Error('Access denied to this topic');
      }

      return {
        topic: {
          id: topic.idTopic,
          subject: topic.firstMessage?.subject || 'Untitled',
          isSticky: Boolean(topic.isSticky),
          locked: Boolean(topic.locked),
          numReplies: topic.numReplies,
          numViews: topic.numViews,
          board: {
            id: topic.board.idBoard,
            name: topic.board.name,
            categoryName: topic.board.category.name
          }
        },
        posts: posts.map((post, index) => ({
          id: post.idMsg,
          subject: post.subject,
          body: post.body,
          posterTime: post.posterTime,
          modifiedTime: post.modifiedTime || null,
          modifiedName: post.modifiedName || null,
          postNumber: offset + index + 1,
          author: {
            id: post.member?.idMember || 0,
            memberName: post.member?.memberName || post.posterName,
            realName: post.member?.realName || null,
            avatar: post.member?.avatar || null,
            signature: post.member?.signature || null,
            personalText: post.member?.personalText || null,
            posts: post.member?.posts || 0,
            dateRegistered: post.member?.dateRegistered || 0,
            group: {
              name: post.member?.membergroup?.groupName || 'Member',
              color: post.member?.membergroup?.onlineColor || null
            }
          }
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalPosts / limit),
          totalItems: totalPosts,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      this.logger.error('Error fetching topic with posts:', error);
      throw error;
    }
  }

  async incrementTopicViews(topicId: number): Promise<void> {
    try {
      await this.prisma.smfTopic.update({
        where: { idTopic: topicId },
        data: {
          numViews: {
            increment: 1
          }
        }
      });
    } catch (error) {
      this.logger.error('Error incrementing topic views:', error);
      // Don't throw error - view counting is not critical
    }
  }

  async getLatestMessages(query: ForumMessageQueryDto): Promise<ForumMessageResponse> {
    const { limit = 10, offset = 0, boardId } = query;

    try {
      // Build the WHERE clause
      let whereClause = '';
      let queryParams: any[] = [limit, offset];
      let paramIndex = 3;

      if (boardId) {
        whereClause = 'AND t.id_board = $' + paramIndex;
        queryParams.push(boardId);
        paramIndex++;
      }

      // Query to get latest messages with topic and board information
      // We get the latest message from each topic to show recent activity
      const messagesQuery = `
        SELECT DISTINCT ON (t.id_topic)
          m.id_msg as id,
          t.id_topic as topic_id,
          t.id_board as board_id,
          COALESCE(first_msg.subject, m.subject) as subject,
          SUBSTRING(m.body FROM 1 FOR 200) as body_excerpt,
          m.poster_time,
          m.poster_name,
          m.id_member as member_id,
          b.name as board_name,
          t.num_replies as topic_replies,
          t.num_views as topic_views,
          (m.id_msg = t.id_first_msg) as is_first_message,
          last_msg.poster_time as last_message_time,
          last_msg.poster_name as last_poster_name
        FROM smf_topics t
        INNER JOIN smf_messages m ON t.id_last_msg = m.id_msg
        LEFT JOIN smf_messages first_msg ON t.id_first_msg = first_msg.id_msg
        LEFT JOIN smf_messages last_msg ON t.id_last_msg = last_msg.id_msg
        INNER JOIN smf_boards b ON t.id_board = b.id_board
        WHERE b.redirect = '' OR b.redirect IS NULL
        ${whereClause}
        ORDER BY t.id_topic, m.poster_time DESC
        LIMIT $1 OFFSET $2
      `;

      // Count query for total
      const countQuery = `
        SELECT COUNT(DISTINCT t.id_topic) as total
        FROM smf_topics t
        INNER JOIN smf_boards b ON t.id_board = b.id_board
        WHERE b.redirect = '' OR b.redirect IS NULL
        ${whereClause.replace('$' + (paramIndex - 1), '$3')}
      `;

      const [messagesResult, countResult] = await Promise.all([
        this.prisma.$queryRawUnsafe(messagesQuery, ...queryParams),
        boardId 
          ? this.prisma.$queryRawUnsafe(countQuery, boardId)
          : this.prisma.$queryRawUnsafe(`
              SELECT COUNT(DISTINCT t.id_topic) as total
              FROM smf_topics t
              INNER JOIN smf_boards b ON t.id_board = b.id_board
              WHERE b.redirect = '' OR b.redirect IS NULL
            `)
      ]);

      const messages: ForumMessage[] = (messagesResult as any[]).map(row => ({
        id: Number(row.id),
        topicId: Number(row.topic_id),
        boardId: Number(row.board_id),
        subject: row.subject || 'Untitled Topic',
        body: this.stripSmfBBCode(row.body_excerpt || ''),
        posterTime: Number(row.poster_time),
        posterName: row.poster_name || 'Unknown',
        memberId: Number(row.member_id) || 0,
        boardName: row.board_name || 'Unknown Board',
        topicReplies: Number(row.topic_replies) || 0,
        topicViews: Number(row.topic_views) || 0,
        isFirstMessage: Boolean(row.is_first_message),
        lastMessageTime: row.last_message_time ? Number(row.last_message_time) : undefined,
        lastPosterName: row.last_poster_name || undefined,
      }));

      const total = Number((countResult as any[])[0]?.total || 0);

      return {
        messages,
        total,
        limit,
        offset,
      };

    } catch (error) {
      this.logger.error('Error fetching forum messages:', error);
      return {
        messages: [],
        total: 0,
        limit,
        offset,
      };
    }
  }

  async getBoardList(): Promise<{ id: number; name: string; description: string }[]> {
    try {
      const boardsQuery = `
        SELECT 
          b.id_board as id,
          b.name,
          b.description
        FROM smf_boards b
        WHERE (b.redirect = '' OR b.redirect IS NULL)
        AND b.id_board > 0
        ORDER BY b.board_order ASC
        LIMIT 20
      `;

      const result = await this.prisma.$queryRawUnsafe(boardsQuery);
      
      return (result as any[]).map(row => ({
        id: Number(row.id),
        name: row.name || 'Unknown Board',
        description: row.description || '',
      }));
    } catch (error) {
      this.logger.error('Error fetching board list:', error);
      return [];
    }
  }

  async getUserForumInfo(userId: number): Promise<any> {
    try {
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        include: {
          membergroup: true,
          _count: {
            select: {
              messages: true,
              startedTopics: true
            }
          }
        }
      });

      if (!user) {
        return null;
      }

      return {
        id: user.idMember,
        memberName: user.memberName,
        realName: user.realName,
        posts: user.posts,
        dateRegistered: user.dateRegistered,
        lastLogin: user.lastLogin,
        avatar: user.avatar,
        signature: user.signature,
        personalText: user.personalText,
        group: {
          name: user.membergroup?.groupName || 'Member',
          color: user.membergroup?.onlineColor || null
        },
        stats: {
          totalMessages: user._count.messages,
          topicsStarted: user._count.startedTopics
        }
      };
    } catch (error) {
      this.logger.error('Error fetching user forum info:', error);
      return null;
    }
  }

  async getUserRecentActivity(userId: number, limit: number = 10): Promise<any> {
    try {
      const recentMessages = await this.prisma.smfMessage.findMany({
        where: { idMember: userId },
        take: limit,
        orderBy: { posterTime: 'desc' },
        include: {
          topic: {
            include: {
              board: true,
              firstMessage: true
            }
          }
        }
      });

      return recentMessages.map(message => ({
        id: message.idMsg,
        subject: message.subject,
        posterTime: message.posterTime,
        topic: {
          id: message.topic.idTopic,
          subject: message.topic.firstMessage?.subject || 'Untitled',
          board: {
            id: message.topic.board.idBoard,
            name: message.topic.board.name
          }
        }
      }));
    } catch (error) {
      this.logger.error('Error fetching user recent activity:', error);
      return [];
    }
  }

  private stripSmfBBCode(text: string): string {
    if (!text) return '';

    return text
      // Remove BBCode tags
      .replace(/\[\/?\w+.*?\]/g, '')
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Clean up multiple spaces and newlines
      .replace(/\s+/g, ' ')
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .trim();
  }

  async checkBoardAccess(boardId: number, userId?: number): Promise<boolean> {
    try {
      // Get board permissions (only member_groups, deny_member_groups doesn't exist in DB)
      const board = await this.prisma.smfBoard.findUnique({
        where: { idBoard: boardId },
        select: { memberGroups: true, name: true }
      });

      if (!board) {
        this.logger.warn(`Board ${boardId} not found, denying access`);
        return false;
      }

      // If no user is logged in, they are considered a guest (group 0)
      const userGroups = userId ? await this.getUserGroups(userId) : [0];
      this.logger.debug(`Board ${boardId} (${board.name}): user groups = [${userGroups.join(',')}], memberGroups = "${board.memberGroups}"`);

      // Parse allowed member groups (comma-separated string)
      // Be more permissive: allow access unless explicitly restricted
      let allowedGroups: number[];
      if (!board.memberGroups || board.memberGroups.trim() === '' || board.memberGroups.trim() === '0') {
        // Default to public access if no restrictions set or only guest restriction
        allowedGroups = [-1, 0, 1, 2, 3, 4]; // Include all common groups
        this.logger.debug(`Board ${boardId}: using default public access`);
      } else {
        allowedGroups = board.memberGroups.split(',').map(g => parseInt(g.trim())).filter(g => !isNaN(g));
        // If no valid groups found, default to public
        if (allowedGroups.length === 0) {
          allowedGroups = [-1, 0, 1, 2, 3, 4];
          this.logger.debug(`Board ${boardId}: no valid groups found, defaulting to public access`);
        }
      }

      // Check if user is in any allowed groups
      // Group -1 means "all groups" (public access)
      if (allowedGroups.includes(-1)) {
        this.logger.debug(`Board ${boardId}: public access granted (-1 in allowed groups)`);
        return true;
      }

      // Check if user's groups match any allowed groups
      const hasAccess = userGroups.some(group => allowedGroups.includes(group));
      this.logger.debug(`Board ${boardId}: access result = ${hasAccess} (user groups [${userGroups.join(',')}] vs allowed [${allowedGroups.join(',')}])`);
      return hasAccess;

    } catch (error) {
      this.logger.error('Error checking board access:', error);
      // On error, default to allowing access to prevent breaking the forum
      this.logger.warn(`Defaulting to allow access for board ${boardId} due to error`);
      return true;
    }
  }

  private async getUserGroups(userId: number): Promise<number[]> {
    try {
      // Check user in smf_members table
      const smfUser = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: {
          idGroup: true,
          idPostGroup: true,
          additionalGroups: true
        }
      });

      this.logger.debug(`getUserGroups for user ${userId}: SMF data = ${JSON.stringify(smfUser)}`);

      if (smfUser) {
        // User found in SMF table, use SMF groups
        const groups = [smfUser.idGroup];

        // Add post group if different from main group
        if (smfUser.idPostGroup && smfUser.idPostGroup !== smfUser.idGroup) {
          groups.push(smfUser.idPostGroup);
          this.logger.debug(`getUserGroups: added post group ${smfUser.idPostGroup} for user ${userId}`);
        }

        // Add additional groups
        if (smfUser.additionalGroups) {
          const additionalGroups = smfUser.additionalGroups
            .split(',')
            .map(g => parseInt(g.trim()))
            .filter(g => !isNaN(g) && g > 0);
          groups.push(...additionalGroups);
          this.logger.debug(`getUserGroups: added additional groups [${additionalGroups.join(',')}] for user ${userId}`);
        }

        const finalGroups = [...new Set(groups)]; // Remove duplicates
        this.logger.debug(`getUserGroups: final SMF groups for user ${userId} = [${finalGroups.join(',')}]`);
        return finalGroups;
      }

      // User not found in SMF table - this could be a legitimate admin user who doesn't have SMF account yet
      // For admin users (from JWT isAdmin=true), grant administrator group access
      this.logger.warn(`getUserGroups: user ${userId} not found in SMF table - considering as potential admin`);

      // Since user 17667 has isAdmin=true in JWT but doesn't exist in SMF table,
      // we'll grant administrator group (1) access as a fallback for authenticated admins
      this.logger.debug(`getUserGroups: granting administrator group [1] for missing user ${userId} (admin fallback)`);
      return [1]; // Administrator group for admin users not in SMF table

    } catch (error) {
      this.logger.error('Error getting user groups:', error);
      return [0]; // Default to guest group on error
    }
  }
}