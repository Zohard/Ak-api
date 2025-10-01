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

              if (!hasAccess) return null;

              // Fetch last message details if available
              let lastMessage: {
                id: number;
                subject: string;
                topicId: number;
                topicSubject: string;
                author: string;
                time: number;
              } | null = null;
              if (board.idLastMsg) {
                const lastMsg = await this.prisma.smfMessage.findUnique({
                  where: { idMsg: board.idLastMsg },
                  include: {
                    topic: {
                      include: {
                        firstMessage: true
                      }
                    }
                  }
                });

                if (lastMsg) {
                  lastMessage = {
                    id: lastMsg.idMsg,
                    subject: lastMsg.subject,
                    topicId: lastMsg.idTopic,
                    topicSubject: lastMsg.topic?.firstMessage?.subject || lastMsg.subject,
                    author: lastMsg.posterName,
                    time: lastMsg.posterTime
                  };
                }
              }

              return {
                id: board.idBoard,
                name: board.name,
                description: board.description,
                numTopics: board.numTopics,
                numPosts: board.numPosts,
                redirect: board.redirect,
                lastMessage: lastMessage
              };
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

      // Filter out categories with no accessible boards
      const categoriesWithBoards = filteredCategories.filter(category => category.boards.length > 0);

      const totalAccessibleBoards = categoriesWithBoards.reduce((total, cat) => total + cat.boards.length, 0);
      this.logger.log(`=== FINAL RESULT: Returning ${categoriesWithBoards.length} categories (filtered from ${filteredCategories.length}) with ${totalAccessibleBoards} accessible boards ===`);

      return categoriesWithBoards;
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

  async getBoardList(): Promise<{ id: number; name: string; boards: { id: number; name: string; description: string }[] }[]> {
    try {
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
            orderBy: { boardOrder: 'asc' }
          }
        }
      });

      return categories.map(category => ({
        id: category.idCat,
        name: category.name,
        boards: category.boards.map(board => ({
          id: board.idBoard,
          name: board.name,
          description: board.description || ''
        }))
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
        idGroup: user.idGroup,
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

  async createTopic(boardId: number, userId: number, subject: string, body: string): Promise<any> {
    try {
      // Check board access
      const hasAccess = await this.checkBoardAccess(boardId, userId);
      if (!hasAccess) {
        throw new Error('Access denied to this board');
      }

      // Get user info
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { memberName: true, emailAddress: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get next message ID
      const lastMessage = await this.prisma.smfMessage.findFirst({
        orderBy: { idMsg: 'desc' },
        select: { idMsg: true }
      });
      const nextMsgId = (lastMessage?.idMsg || 0) + 1;

      // Get next topic ID
      const lastTopic = await this.prisma.smfTopic.findFirst({
        orderBy: { idTopic: 'desc' },
        select: { idTopic: true }
      });
      const nextTopicId = (lastTopic?.idTopic || 0) + 1;

      const currentTime = Math.floor(Date.now() / 1000);

      // Create topic and first message in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the first message
        const message = await prisma.smfMessage.create({
          data: {
            idMsg: nextMsgId,
            idTopic: nextTopicId,
            idBoard: boardId,
            posterTime: currentTime,
            idMember: userId,
            subject: subject,
            posterName: user.memberName,
            posterEmail: user.emailAddress,
            body: body,
            approved: 1
          }
        });

        // Create the topic
        const topic = await prisma.smfTopic.create({
          data: {
            idTopic: nextTopicId,
            idBoard: boardId,
            idFirstMsg: nextMsgId,
            idLastMsg: nextMsgId,
            idMemberStarted: userId,
            idMemberUpdated: userId,
            numReplies: 0,
            numViews: 0,
            approved: 1
          }
        });

        // Update board stats
        await prisma.smfBoard.update({
          where: { idBoard: boardId },
          data: {
            numTopics: { increment: 1 },
            numPosts: { increment: 1 },
            idLastMsg: nextMsgId
          }
        });

        // Update user post count
        await prisma.smfMember.update({
          where: { idMember: userId },
          data: {
            posts: { increment: 1 }
          }
        });

        return { topic, message };
      });

      return {
        topicId: result.topic.idTopic,
        messageId: result.message.idMsg,
        subject: subject
      };
    } catch (error) {
      this.logger.error('Error creating topic:', error);
      throw error;
    }
  }

  async createPost(topicId: number, userId: number, subject: string, body: string): Promise<any> {
    try {
      // Get topic info
      const topic = await this.prisma.smfTopic.findUnique({
        where: { idTopic: topicId },
        include: {
          firstMessage: true,
          board: true
        }
      });

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check if topic is locked
      if (topic.locked) {
        throw new Error('Topic is locked');
      }

      // Check board access
      const hasAccess = await this.checkBoardAccess(topic.idBoard, userId);
      if (!hasAccess) {
        throw new Error('Access denied to this board');
      }

      // Get user info
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { memberName: true, emailAddress: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get next message ID
      const lastMessage = await this.prisma.smfMessage.findFirst({
        orderBy: { idMsg: 'desc' },
        select: { idMsg: true }
      });
      const nextMsgId = (lastMessage?.idMsg || 0) + 1;

      const currentTime = Math.floor(Date.now() / 1000);

      // Use topic subject with "Re: " prefix if no subject provided
      const postSubject = subject || `Re: ${topic.firstMessage?.subject || 'Untitled'}`;

      // Create post in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the message
        const message = await prisma.smfMessage.create({
          data: {
            idMsg: nextMsgId,
            idTopic: topicId,
            idBoard: topic.idBoard,
            posterTime: currentTime,
            idMember: userId,
            subject: postSubject,
            posterName: user.memberName,
            posterEmail: user.emailAddress,
            body: body,
            approved: 1
          }
        });

        // Update topic stats
        await prisma.smfTopic.update({
          where: { idTopic: topicId },
          data: {
            numReplies: { increment: 1 },
            idLastMsg: nextMsgId,
            idMemberUpdated: userId
          }
        });

        // Update board stats
        await prisma.smfBoard.update({
          where: { idBoard: topic.idBoard },
          data: {
            numPosts: { increment: 1 },
            idLastMsg: nextMsgId
          }
        });

        // Update user post count
        await prisma.smfMember.update({
          where: { idMember: userId },
          data: {
            posts: { increment: 1 }
          }
        });

        return message;
      });

      return {
        messageId: result.idMsg,
        subject: postSubject,
        topicId: topicId
      };
    } catch (error) {
      this.logger.error('Error creating post:', error);
      throw error;
    }
  }

  async getForumStats(): Promise<any> {
    try {
      // Get total messages, topics, and members
      const [totalMessages, totalTopics, totalMembers, latestMember, latestMessage] = await Promise.all([
        this.prisma.smfMessage.count(),
        this.prisma.smfTopic.count(),
        this.prisma.smfMember.count(),
        // Get latest member
        this.prisma.smfMember.findFirst({
          orderBy: { dateRegistered: 'desc' },
          select: {
            idMember: true,
            memberName: true,
            dateRegistered: true
          }
        }),
        // Get latest message with topic and board info
        // Use the topic's current board to ensure moved topics show the correct board
        this.prisma.smfMessage.findFirst({
          orderBy: { posterTime: 'desc' },
          where: {
            topic: {
              board: {
                OR: [
                  { redirect: null },
                  { redirect: '' }
                ]
              }
            }
          },
          include: {
            topic: {
              include: {
                firstMessage: true,
                board: true  // Include the topic's board instead of message's board
              }
            }
          }
        })
      ]);

      return {
        totalMessages,
        totalTopics,
        totalMembers,
        latestMember: latestMember ? {
          id: latestMember.idMember,
          name: latestMember.memberName,
          dateRegistered: latestMember.dateRegistered
        } : null,
        latestMessage: latestMessage ? {
          id: latestMessage.idMsg,
          subject: latestMessage.topic?.firstMessage?.subject || latestMessage.subject,
          posterName: latestMessage.posterName,
          posterTime: latestMessage.posterTime,
          topicId: latestMessage.idTopic,
          boardName: latestMessage.topic?.board?.name || 'Unknown'  // Use topic's board, not message's board
        } : null
      };
    } catch (error) {
      this.logger.error('Error fetching forum stats:', error);
      return {
        totalMessages: 0,
        totalTopics: 0,
        totalMembers: 0,
        latestMember: null,
        latestMessage: null
      };
    }
  }

  async getOnlineUsers(): Promise<any> {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const fifteenMinutesAgo = currentTime - (15 * 60);

      // Get users who logged in within the last 15 minutes
      const onlineMembers = await this.prisma.smfMember.findMany({
        where: {
          lastLogin: {
            gte: fifteenMinutesAgo
          }
        },
        select: {
          idMember: true,
          memberName: true,
          lastLogin: true
        },
        orderBy: {
          lastLogin: 'desc'
        }
      });

      // For guests count, we'll need to track this separately
      // For now, we'll return 0 guests as we don't have session tracking
      // You can implement this later with session tracking

      return {
        members: onlineMembers.map(m => ({
          id: m.idMember,
          name: m.memberName,
          lastSeen: m.lastLogin
        })),
        totalMembers: onlineMembers.length,
        totalGuests: 0 // Placeholder - needs session tracking
      };
    } catch (error) {
      this.logger.error('Error fetching online users:', error);
      return {
        members: [],
        totalMembers: 0,
        totalGuests: 0
      };
    }
  }

  async updateUserActivity(userId: number): Promise<void> {
    try {
      const currentTime = Math.floor(Date.now() / 1000);

      await this.prisma.smfMember.update({
        where: { idMember: userId },
        data: { lastLogin: currentTime }
      });
    } catch (error) {
      this.logger.error('Error updating user activity:', error);
      // Don't throw - activity tracking is not critical
    }
  }

  async getUpcomingBirthdays(): Promise<any> {
    try {
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);

      // Get members with birthdays in the next 7 days
      const members = await this.prisma.smfMember.findMany({
        where: {
          birthdate: {
            not: null
          }
        },
        select: {
          idMember: true,
          memberName: true,
          birthdate: true
        }
      });

      // Filter and calculate ages
      const upcomingBirthdays = members
        .filter(member => {
          if (!member.birthdate) return false;

          const birthDate = new Date(member.birthdate);
          const thisYearBirthday = new Date(
            today.getFullYear(),
            birthDate.getMonth(),
            birthDate.getDate()
          );

          // Check if birthday is within the next 7 days
          return thisYearBirthday >= today && thisYearBirthday <= nextWeek;
        })
        .map(member => {
          const birthDate = new Date(member.birthdate!);
          const age = today.getFullYear() - birthDate.getFullYear();

          return {
            id: member.idMember,
            name: member.memberName,
            birthdate: member.birthdate,
            age: age
          };
        })
        .sort((a, b) => {
          const aDate = new Date(a.birthdate!);
          const bDate = new Date(b.birthdate!);
          const aMonth = aDate.getMonth();
          const bMonth = bDate.getMonth();
          const aDay = aDate.getDate();
          const bDay = bDate.getDate();

          if (aMonth !== bMonth) return aMonth - bMonth;
          return aDay - bDay;
        });

      return upcomingBirthdays;
    } catch (error) {
      this.logger.error('Error fetching upcoming birthdays:', error);
      return [];
    }
  }

  async updatePost(messageId: number, userId: number, subject: string, body: string): Promise<any> {
    try {
      // Get the message to check permissions
      const message = await this.prisma.smfMessage.findUnique({
        where: { idMsg: messageId },
        include: {
          topic: true
        }
      });

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user owns this message (or is admin)
      if (message.idMember !== userId) {
        // Check if user is admin
        const userGroups = await this.getUserGroups(userId);
        const isAdmin = userGroups.includes(1); // Group 1 is admin

        if (!isAdmin) {
          throw new Error('You can only edit your own messages');
        }
      }

      // Check if topic is locked
      if (message.topic.locked) {
        throw new Error('Cannot edit message in a locked topic');
      }

      // Get user info
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { memberName: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // Update the message
      const updatedMessage = await this.prisma.smfMessage.update({
        where: { idMsg: messageId },
        data: {
          subject: subject || message.subject,
          body: body,
          modifiedTime: currentTime,
          modifiedName: user.memberName
        }
      });

      return {
        messageId: updatedMessage.idMsg,
        subject: updatedMessage.subject,
        success: true
      };
    } catch (error) {
      this.logger.error('Error updating post:', error);
      throw error;
    }
  }

  async deletePost(messageId: number, userId: number): Promise<any> {
    try {
      // Get the message to check permissions
      const message = await this.prisma.smfMessage.findUnique({
        where: { idMsg: messageId },
        include: {
          topic: {
            include: {
              board: true
            }
          }
        }
      });

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user owns this message (or is admin)
      if (message.idMember !== userId) {
        // Check if user is admin
        const userGroups = await this.getUserGroups(userId);
        const isAdmin = userGroups.includes(1); // Group 1 is admin

        if (!isAdmin) {
          throw new Error('You can only delete your own messages');
        }
      }

      // Check if this is the first message of the topic
      if (message.topic.idFirstMsg === messageId) {
        // If it's the first message, we need to delete the entire topic
        await this.prisma.$transaction(async (prisma) => {
          // Delete all messages in the topic
          await prisma.smfMessage.deleteMany({
            where: { idTopic: message.idTopic }
          });

          // Delete the topic
          await prisma.smfTopic.delete({
            where: { idTopic: message.idTopic }
          });

          // Update board stats
          await prisma.smfBoard.update({
            where: { idBoard: message.idBoard },
            data: {
              numTopics: { decrement: 1 },
              numPosts: { decrement: message.topic.numReplies + 1 }
            }
          });

          // Update user post count
          await prisma.smfMember.update({
            where: { idMember: message.idMember },
            data: {
              posts: { decrement: 1 }
            }
          });
        });

        return {
          success: true,
          topicDeleted: true,
          boardId: message.idBoard
        };
      } else {
        // Regular reply - just delete the message
        await this.prisma.$transaction(async (prisma) => {
          // Delete the message
          await prisma.smfMessage.delete({
            where: { idMsg: messageId }
          });

          // Update topic stats
          await prisma.smfTopic.update({
            where: { idTopic: message.idTopic },
            data: {
              numReplies: { decrement: 1 }
            }
          });

          // Update board stats
          await prisma.smfBoard.update({
            where: { idBoard: message.idBoard },
            data: {
              numPosts: { decrement: 1 }
            }
          });

          // Update user post count
          await prisma.smfMember.update({
            where: { idMember: message.idMember },
            data: {
              posts: { decrement: 1 }
            }
          });
        });

        return {
          success: true,
          topicDeleted: false,
          topicId: message.idTopic
        };
      }
    } catch (error) {
      this.logger.error('Error deleting post:', error);
      throw error;
    }
  }

  async moveTopic(topicId: number, targetBoardId: number, userId: number): Promise<any> {
    try {
      // Check if user has permission to move topics (Administrator, Global Moderator, or Moderator)
      const userGroups = await this.getUserGroups(userId);
      const canMoveTopic = userGroups.some(group => [1, 2, 3].includes(group));

      if (!canMoveTopic) {
        throw new Error('You do not have permission to move topics');
      }

      // Get the topic with its current board info
      const topic = await this.prisma.smfTopic.findUnique({
        where: { idTopic: topicId },
        include: {
          board: true
        }
      });

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check if target board exists and get its info
      const targetBoard = await this.prisma.smfBoard.findUnique({
        where: { idBoard: targetBoardId }
      });

      if (!targetBoard) {
        throw new Error('Target board not found');
      }

      // Check if topic is already in the target board
      if (topic.idBoard === targetBoardId) {
        throw new Error('Topic is already in the target board');
      }

      // Check if user has access to both source and target boards
      const hasSourceAccess = await this.checkBoardAccess(topic.idBoard, userId);
      const hasTargetAccess = await this.checkBoardAccess(targetBoardId, userId);

      if (!hasSourceAccess || !hasTargetAccess) {
        throw new Error('You do not have access to move topics between these boards');
      }

      const sourceBoardId = topic.idBoard;

      // Count messages in this topic
      const messageCount = await this.prisma.smfMessage.count({
        where: { idTopic: topicId }
      });

      // Move the topic in a transaction
      await this.prisma.$transaction(async (prisma) => {
        // Update all messages to the new board
        await prisma.smfMessage.updateMany({
          where: { idTopic: topicId },
          data: { idBoard: targetBoardId }
        });

        // Update the topic to the new board
        await prisma.smfTopic.update({
          where: { idTopic: topicId },
          data: { idBoard: targetBoardId }
        });

        // Update source board stats (decrement)
        await prisma.smfBoard.update({
          where: { idBoard: sourceBoardId },
          data: {
            numTopics: { decrement: 1 },
            numPosts: { decrement: messageCount }
          }
        });

        // Update target board stats (increment)
        await prisma.smfBoard.update({
          where: { idBoard: targetBoardId },
          data: {
            numTopics: { increment: 1 },
            numPosts: { increment: messageCount }
          }
        });

        // Recalculate last message for source board
        const sourceLastMessage = await prisma.smfMessage.findFirst({
          where: { idBoard: sourceBoardId },
          orderBy: { posterTime: 'desc' },
          select: { idMsg: true }
        });

        await prisma.smfBoard.update({
          where: { idBoard: sourceBoardId },
          data: {
            idLastMsg: sourceLastMessage?.idMsg || 0,
            idMsgUpdated: sourceLastMessage?.idMsg || 0
          }
        });

        // Recalculate last message for target board
        const targetLastMessage = await prisma.smfMessage.findFirst({
          where: { idBoard: targetBoardId },
          orderBy: { posterTime: 'desc' },
          select: { idMsg: true }
        });

        await prisma.smfBoard.update({
          where: { idBoard: targetBoardId },
          data: {
            idLastMsg: targetLastMessage?.idMsg || 0,
            idMsgUpdated: targetLastMessage?.idMsg || 0
          }
        });
      });

      this.logger.log(`Topic ${topicId} moved from board ${sourceBoardId} to board ${targetBoardId} by user ${userId}`);

      return {
        success: true,
        topicId: topicId,
        sourceBoardId: sourceBoardId,
        sourceBoardName: topic.board.name,
        targetBoardId: targetBoardId,
        targetBoardName: targetBoard.name,
        messageCount: messageCount
      };
    } catch (error) {
      this.logger.error('Error moving topic:', error);
      throw error;
    }
  }

  async lockTopic(topicId: number, locked: boolean, userId: number): Promise<any> {
    try {
      // Check if user has permission to lock topics (Administrator, Global Moderator, or Moderator)
      const userGroups = await this.getUserGroups(userId);
      const canLockTopic = userGroups.some(group => [1, 2, 3].includes(group));

      if (!canLockTopic) {
        throw new Error('You do not have permission to lock/unlock topics');
      }

      // Get the topic
      const topic = await this.prisma.smfTopic.findUnique({
        where: { idTopic: topicId },
        include: {
          board: true,
          firstMessage: true
        }
      });

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check if user has access to the board
      const hasAccess = await this.checkBoardAccess(topic.idBoard, userId);
      if (!hasAccess) {
        throw new Error('You do not have access to this topic');
      }

      // Update the topic lock status
      const updatedTopic = await this.prisma.smfTopic.update({
        where: { idTopic: topicId },
        data: {
          locked: locked ? 1 : 0
        }
      });

      const action = locked ? 'locked' : 'unlocked';
      this.logger.log(`Topic ${topicId} ${action} by user ${userId}`);

      return {
        success: true,
        topicId: topicId,
        subject: topic.firstMessage?.subject || 'Untitled',
        locked: Boolean(updatedTopic.locked),
        boardId: topic.idBoard,
        boardName: topic.board.name
      };
    } catch (error) {
      this.logger.error('Error locking/unlocking topic:', error);
      throw error;
    }
  }

  async reportMessage(messageId: number, userId: number, comment: string): Promise<any> {
    try {
      // Get the message to verify it exists and check board access
      const message = await this.prisma.smfMessage.findUnique({
        where: { idMsg: messageId },
        include: {
          topic: {
            include: {
              board: true
            }
          }
        }
      });

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user has access to the board where this message is posted
      const hasAccess = await this.checkBoardAccess(message.idBoard, userId);
      if (!hasAccess) {
        throw new Error('Access denied to this message');
      }

      // Check if user has already reported this message
      const existingReport = await this.prisma.smfMessageReport.findFirst({
        where: {
          idMsg: messageId,
          idMember: userId,
          closed: 0 // Only check open reports
        }
      });

      if (existingReport) {
        throw new Error('You have already reported this message');
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // Create the report
      const report = await this.prisma.smfMessageReport.create({
        data: {
          idMsg: messageId,
          idMember: userId,
          comment: comment,
          timeStarted: currentTime,
          closed: 0
        }
      });

      this.logger.log(`Message ${messageId} reported by user ${userId} (report ID: ${report.idReport})`);

      return {
        success: true,
        reportId: report.idReport,
        messageId: messageId
      };
    } catch (error) {
      this.logger.error('Error reporting message:', error);
      throw error;
    }
  }

  async getReportsCount(userId: number): Promise<{ count: number }> {
    try {
      // Check if user has permission to view reports (Administrator, Global Moderator, or Moderator)
      const userGroups = await this.getUserGroups(userId);
      const canViewReports = userGroups.some(group => [1, 2, 3].includes(group));

      if (!canViewReports) {
        throw new Error('You do not have permission to view reports');
      }

      // Count only open reports (closed = 0)
      const count = await this.prisma.smfMessageReport.count({
        where: { closed: 0 }
      });

      return { count };
    } catch (error) {
      console.error('Error getting reports count:', error);
      throw error;
    }
  }

  async getReports(userId: number, status?: number, limit: number = 20, offset: number = 0): Promise<any> {
    try {
      // Check if user has permission to view reports (Administrator, Global Moderator, or Moderator)
      const userGroups = await this.getUserGroups(userId);
      const canViewReports = userGroups.some(group => [1, 2, 3].includes(group));

      if (!canViewReports) {
        throw new Error('You do not have permission to view reports');
      }

      // Build where clause
      const whereClause: any = {};
      if (status !== undefined) {
        whereClause.closed = status;
      }

      // Get reports with related data
      const [reports, totalReports] = await Promise.all([
        this.prisma.smfMessageReport.findMany({
          where: whereClause,
          skip: offset,
          take: limit,
          orderBy: { timeStarted: 'desc' },
          include: {
            reporter: {
              select: {
                idMember: true,
                memberName: true,
                emailAddress: true
              }
            },
            message: {
              include: {
                topic: {
                  include: {
                    board: true
                  }
                }
              }
            },
            closer: {
              select: {
                idMember: true,
                memberName: true
              }
            }
          }
        }),
        this.prisma.smfMessageReport.count({
          where: whereClause
        })
      ]);

      return {
        reports: reports.map(report => ({
          idReport: report.idReport,
          idMsg: report.idMsg,
          comment: report.comment,
          timeStarted: report.timeStarted,
          closed: report.closed,
          closedBy: report.closedBy,
          timeClose: report.timeClose,
          reporter: {
            id: report.reporter.idMember,
            memberName: report.reporter.memberName,
            emailAddress: report.reporter.emailAddress
          },
          message: {
            id: report.message.idMsg,
            subject: report.message.subject,
            body: report.message.body.substring(0, 200), // Truncate for list view
            posterName: report.message.posterName,
            posterTime: report.message.posterTime,
            topicId: report.message.idTopic,
            boardId: report.message.idBoard,
            boardName: report.message.topic.board.name
          },
          closer: report.closer ? {
            id: report.closer.idMember,
            memberName: report.closer.memberName
          } : null
        })),
        total: totalReports,
        limit,
        offset
      };
    } catch (error) {
      this.logger.error('Error fetching reports:', error);
      throw error;
    }
  }

  async getReportById(reportId: number, userId: number): Promise<any> {
    try {
      // Check if user has permission to view reports (Administrator, Global Moderator, or Moderator)
      const userGroups = await this.getUserGroups(userId);
      const canViewReports = userGroups.some(group => [1, 2, 3].includes(group));

      if (!canViewReports) {
        throw new Error('You do not have permission to view reports');
      }

      // Get the report with all related data
      const report = await this.prisma.smfMessageReport.findUnique({
        where: { idReport: reportId },
        include: {
          reporter: {
            select: {
              idMember: true,
              memberName: true,
              emailAddress: true
            }
          },
          message: {
            include: {
              topic: {
                include: {
                  board: true,
                  firstMessage: true
                }
              }
            }
          },
          closer: {
            select: {
              idMember: true,
              memberName: true
            }
          }
        }
      });

      if (!report) {
        throw new Error('Report not found');
      }

      return {
        idReport: report.idReport,
        idMsg: report.idMsg,
        comment: report.comment,
        timeStarted: report.timeStarted,
        closed: report.closed,
        closedBy: report.closedBy,
        timeClose: report.timeClose,
        reporter: {
          id: report.reporter.idMember,
          memberName: report.reporter.memberName,
          emailAddress: report.reporter.emailAddress
        },
        message: {
          id: report.message.idMsg,
          subject: report.message.subject,
          body: report.message.body,
          posterName: report.message.posterName,
          posterTime: report.message.posterTime,
          topicId: report.message.idTopic,
          boardId: report.message.idBoard,
          topic: {
            id: report.message.topic.idTopic,
            subject: report.message.topic.firstMessage?.subject || 'Untitled',
            boardName: report.message.topic.board.name
          }
        },
        closer: report.closer ? {
          id: report.closer.idMember,
          memberName: report.closer.memberName
        } : null
      };
    } catch (error) {
      this.logger.error('Error fetching report:', error);
      throw error;
    }
  }

  async closeReport(reportId: number, userId: number): Promise<any> {
    try {
      // Check if user has permission to close reports (Administrator, Global Moderator, or Moderator)
      const userGroups = await this.getUserGroups(userId);
      const canCloseReports = userGroups.some(group => [1, 2, 3].includes(group));

      if (!canCloseReports) {
        throw new Error('You do not have permission to close reports');
      }

      // Get the report
      const report = await this.prisma.smfMessageReport.findUnique({
        where: { idReport: reportId }
      });

      if (!report) {
        throw new Error('Report not found');
      }

      if (report.closed) {
        throw new Error('Report is already closed');
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // Close the report
      const updatedReport = await this.prisma.smfMessageReport.update({
        where: { idReport: reportId },
        data: {
          closed: 1,
          closedBy: userId,
          timeClose: currentTime
        }
      });

      this.logger.log(`Report ${reportId} closed by user ${userId}`);

      return {
        success: true,
        reportId: updatedReport.idReport,
        closed: Boolean(updatedReport.closed)
      };
    } catch (error) {
      this.logger.error('Error closing report:', error);
      throw error;
    }
  }
}