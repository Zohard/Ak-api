import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ForumMessageQueryDto, ForumMessage, ForumMessageResponse } from './dto/forum-message.dto';

@Injectable()
export class ForumsService {
  private readonly logger = new Logger(ForumsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCategories(userId?: number) {
    try {
      // Fetch user groups ONCE at the start (HUGE performance improvement!)
      const userGroups = userId ? await this.getUserGroups(userId) : [0];

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
            select: {
              idBoard: true,
              name: true,
              description: true,
              numTopics: true,
              numPosts: true,
              redirect: true,
              idLastMsg: true,
              idParent: true, // Include idParent to identify child boards
              memberGroups: true, // Include for permission checking (no extra query needed!)
              _count: {
                select: { topics: true, messages: true }
              }
            }
          }
        }
      });

      if (categories.length === 0) {
        return [];
      }

      // Collect all last message IDs across all boards
      const allLastMsgIds = categories.flatMap(cat =>
        cat.boards.map(board => board.idLastMsg).filter(id => id !== null && id > 0)
      );

      // Fetch all last messages in a single query (HUGE performance improvement!)
      const lastMessages = allLastMsgIds.length > 0 ? await this.prisma.smfMessage.findMany({
        where: { idMsg: { in: allLastMsgIds } },
        include: {
          topic: {
            include: {
              firstMessage: true
            }
          }
        }
      }) : [];

      // Create a map for quick lookup
      const lastMessagesMap = new Map(
        lastMessages.map(msg => [
          msg.idMsg,
          {
            id: msg.idMsg,
            subject: msg.subject,
            topicId: msg.idTopic,
            topicSubject: msg.topic?.firstMessage?.subject || msg.subject,
            author: msg.posterName,
            time: msg.posterTime,
            numReplies: msg.topic?.numReplies
          }
        ])
      );

      // Filter boards based on access permissions
      const filteredCategories = categories.map(category => {
        // Build all board objects with their data (NO async needed - all data already fetched!)
        const allBoardsWithData = category.boards.map(board => {
          // Check permissions inline (no database query!)
          let allowedGroups: number[];
          if (!board.memberGroups || board.memberGroups.trim() === '' || board.memberGroups.trim() === '0') {
            // Default to public access
            allowedGroups = [-1, 0, 1, 2, 3, 4];
          } else {
            allowedGroups = board.memberGroups.split(',').map(g => parseInt(g.trim())).filter(g => !isNaN(g));
            if (allowedGroups.length === 0) {
              allowedGroups = [-1, 0, 1, 2, 3, 4];
            }
          }

          // Check if user has access (group -1 means public, or user group matches)
          const hasAccess = allowedGroups.includes(-1) || userGroups.some(group => allowedGroups.includes(group));

          if (!hasAccess) return null;

          // Get last message from pre-fetched map (no extra query!)
          const lastMessage = board.idLastMsg ? lastMessagesMap.get(board.idLastMsg) || null : null;

          return {
            id: board.idBoard,
            name: board.name,
            description: board.description,
            numTopics: board.numTopics,
            numPosts: board.numPosts,
            redirect: board.redirect,
            lastMessage: lastMessage,
            idParent: board.idParent
          };
        });

        // Filter out null values (boards without access)
        const accessibleBoards = allBoardsWithData.filter(board => board !== null);

        // Separate parent boards (idParent === 0) from child boards (idParent > 0)
        const parentBoards = accessibleBoards.filter(board => board.idParent === 0);
        const childBoards = accessibleBoards.filter(board => board.idParent > 0);

        // Nest child boards under their parent boards
        const boardsWithChildren = parentBoards.map(parentBoard => {
          const children = childBoards.filter(child => child.idParent === parentBoard.id);

          // Remove idParent from the response (we don't need it in the frontend)
          const { idParent: _, ...boardWithoutIdParent } = parentBoard;

          return {
            ...boardWithoutIdParent,
            children: children.length > 0 ? children.map(child => {
              const { idParent: __, ...childWithoutIdParent } = child;
              return childWithoutIdParent;
            }) : undefined
          };
        });

        return {
          id: category.idCat,
          name: category.name,
          catOrder: category.catOrder,
          canCollapse: Boolean(category.canCollapse),
          boards: boardsWithChildren
        };
      });

      // Filter out categories with no accessible boards
      const categoriesWithBoards = filteredCategories.filter(category => category.boards.length > 0);

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
          hasPoll: topic.idPoll > 0,
          numReplies: topic.numReplies,
          numViews: topic.numViews,
          starter: {
            id: topic.starter?.idMember || 0,
            name: topic.starter?.memberName || topic.firstMessage?.posterName || 'Unknown'
          },
          lastMessage: topic.lastMessage ? {
            id: topic.lastMessage.idMsg,
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
                membergroup: true,
                _count: {
                  select: {
                    animeCollections: true,
                    mangaCollections: true
                  }
                }
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

      // Get poll data if topic has a poll
      let pollData = null;
      if (topic.idPoll > 0) {
        pollData = await this.getPollData(topic.idPoll, userId);
      }

      return {
        topic: {
          id: topic.idTopic,
          subject: topic.firstMessage?.subject || 'Untitled',
          isSticky: Boolean(topic.isSticky),
          locked: Boolean(topic.locked),
          numReplies: topic.numReplies,
          numViews: topic.numViews,
          hasPoll: topic.idPoll > 0,
          board: {
            id: topic.board.idBoard,
            name: topic.board.name,
            categoryName: topic.board.category.name
          }
        },
        poll: pollData,
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
            gender: post.member?.gender || 0,
            posts: post.member?.posts || 0,
            dateRegistered: post.member?.dateRegistered || 0,
            nbCritiques: post.member?.nbCritiques || 0,
            animeCount: post.member?._count?.animeCollections || 0,
            mangaCount: post.member?._count?.mangaCollections || 0,
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

  async searchTopics(query: string, limit: number = 10) {
    try {
      const topics = await this.prisma.smfTopic.findMany({
        where: {
          firstMessage: {
            subject: {
              contains: query,
              mode: 'insensitive'
            }
          }
        },
        include: {
          board: {
            select: {
              idBoard: true,
              name: true
            }
          },
          firstMessage: {
            select: {
              subject: true
            }
          }
        },
        take: limit,
        orderBy: {
          numViews: 'desc' // Most viewed first
        }
      });

      return topics
        .filter((topic): topic is typeof topic & { firstMessage: NonNullable<typeof topic.firstMessage> } =>
          topic.firstMessage !== null
        )
        .map(topic => ({
          id: topic.idTopic,
          subject: topic.firstMessage.subject || 'Untitled',
          boardId: topic.board.idBoard,
          boardName: topic.board.name,
          replies: topic.numReplies,
          views: topic.numViews,
          locked: topic.locked === 1
        }));
    } catch (error) {
      this.logger.error('Error searching topics:', error);
      return [];
    }
  }
  async getTopicMetadata(topicId: number) {
    try {
      const topic = await this.prisma.smfTopic.findUnique({
        where: { idTopic: topicId },
        include: {
          board: {
            select: {
              idBoard: true,
              name: true
            }
          },
          firstMessage: {
            select: {
              subject: true
            }
          }
        }
      });

      if (!topic || !topic.firstMessage) {
        return null;
      }

      return {
        id: topic.idTopic,
        subject: topic.firstMessage.subject || 'Untitled',
        boardId: topic.board.idBoard,
        boardName: topic.board.name,
        replies: topic.numReplies,
        views: topic.numViews,
        locked: topic.locked === 1
      };
    } catch (error) {
      this.logger.error('Error fetching topic metadata:', error);
      return null;
    }
  }

  async getTopicPreview(topicId: number, userId?: number) {
    try {
      const topic = await this.prisma.smfTopic.findUnique({
        where: { idTopic: topicId },
        include: {
          board: true,
          firstMessage: true,
          lastMessage: {
            include: {
              member: {
                select: {
                  idMember: true,
                  memberName: true
                }
              }
            }
          }
        }
      });

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check board access permissions
      const hasAccess = await this.checkBoardAccess(topic.board.idBoard, userId);
      if (!hasAccess) {
        throw new Error('Access denied to this topic');
      }

      return {
        id: topic.idTopic,
        subject: topic.firstMessage?.subject || 'Untitled',
        author: topic.firstMessage?.posterName || 'Unknown',
        createdAt: topic.firstMessage?.posterTime ? new Date(Number(topic.firstMessage.posterTime) * 1000).toISOString() : new Date().toISOString(),
        numReplies: topic.numReplies,
        numViews: topic.numViews,
        lastPost: topic.lastMessage ? {
          author: topic.lastMessage.posterName,
          date: new Date(Number(topic.lastMessage.posterTime) * 1000).toISOString()
        } : null
      };
    } catch (error) {
      this.logger.error('Error fetching topic preview:', error);
      throw error;
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
      // Filter out deleted/unapproved messages (approved = 0)
      // Filter out messages in recycle bin (board_id = 10 is Corbeille/trash)
      const messagesQuery = `
        SELECT
          m.id_msg as id,
          t.id_topic as topic_id,
          t.id_board as board_id,
          COALESCE(first_msg.subject, m.subject) as subject,
          m.body as body_excerpt,
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
        WHERE (b.redirect = '' OR b.redirect IS NULL)
        AND m.approved = 1
        AND t.approved = 1
        AND t.id_board != 10
        ${whereClause}
        ORDER BY m.poster_time DESC
        LIMIT $1 OFFSET $2
      `;

      // Count query for total
      const countQuery = `
        SELECT COUNT(DISTINCT t.id_topic) as total
        FROM smf_topics t
        INNER JOIN smf_boards b ON t.id_board = b.id_board
        WHERE (b.redirect = '' OR b.redirect IS NULL)
        AND t.approved = 1
        AND t.id_board != 10
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
              WHERE (b.redirect = '' OR b.redirect IS NULL)
              AND t.approved = 1
              AND t.id_board != 10
            `)
      ]);

      const messages: ForumMessage[] = (messagesResult as any[]).map(row => ({
        id: Number(row.id),
        topicId: Number(row.topic_id),
        boardId: Number(row.board_id),
        subject: row.subject || 'Untitled Topic',
        body: row.body_excerpt || '', // Return raw BBCode for frontend parsing
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

  /**
   * Get all forum posts from a specific user with pagination
   * Only shows approved messages in non-redirect boards
   * ULTRA-OPTIMIZED: Uses raw SQL for maximum performance
   */
  async getUserPosts(userId: number, page: number = 1, limit: number = 20): Promise<any> {
    try {
      // Get user info and groups in parallel
      const [user, userGroups] = await Promise.all([
        this.prisma.smfMember.findUnique({
          where: { idMember: userId },
          select: {
            idMember: true,
            memberName: true,
            realName: true,
            avatar: true,
            posts: true
          }
        }),
        this.getUserGroups(userId)
      ]);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const skip = (page - 1) * limit;
      const fetchLimit = limit * 2; // Fetch 2x to account for filtering

      // Use raw SQL for better performance
      const messages: any[] = await this.prisma.$queryRaw`
        SELECT
          m.id_msg as "idMsg",
          m.id_topic as "idTopic",
          m.subject,
          m.body,
          m.poster_time as "posterTime",
          m.modified_time as "modifiedTime",
          m.modified_name as "modifiedName",
          b.id_board as "boardId",
          b.name as "boardName",
          b.member_groups as "memberGroups",
          fm.subject as "topicSubject"
        FROM smf_messages m
        INNER JOIN smf_topics t ON m.id_topic = t.id_topic
        INNER JOIN smf_boards b ON t.id_board = b.id_board
        LEFT JOIN smf_messages fm ON t.id_first_msg = fm.id_msg
        WHERE m.id_member = ${userId}
          AND m.approved = 1
          AND (b.redirect IS NULL OR b.redirect = '')
          AND t.id_board != 10
        ORDER BY m.poster_time DESC
        LIMIT ${fetchLimit}
        OFFSET ${skip}
      `;

      // Build a map of board permissions
      const boardAccessMap = new Map<number, boolean>();

      // Filter messages by board access
      const accessibleMessages: any[] = [];
      for (const message of messages) {
        const boardId = Number(message.boardId);

        // Check if we've already determined access for this board
        if (!boardAccessMap.has(boardId)) {
          const memberGroups = message.memberGroups || '';
          let hasAccess = true;

          // Parse allowed member groups
          let allowedGroups: number[];
          if (!memberGroups || memberGroups.trim() === '' || memberGroups.trim() === '0') {
            allowedGroups = [-1, 0, 1, 2, 3, 4];
          } else {
            allowedGroups = memberGroups.split(',').map((g: string) => parseInt(g.trim())).filter((g: number) => !isNaN(g));
            if (allowedGroups.length === 0) {
              allowedGroups = [-1, 0, 1, 2, 3, 4];
            }
          }

          // Check access
          if (!allowedGroups.includes(-1)) {
            hasAccess = userGroups.some(group => allowedGroups.includes(group));
          }

          boardAccessMap.set(boardId, hasAccess);
        }

        if (boardAccessMap.get(boardId)) {
          accessibleMessages.push(message);
          if (accessibleMessages.length >= limit) {
            break;
          }
        }
      }

      // Get total count using simpler query
      const countResult: any[] = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM smf_messages m
        INNER JOIN smf_topics t ON m.id_topic = t.id_topic
        INNER JOIN smf_boards b ON t.id_board = b.id_board
        WHERE m.id_member = ${userId}
          AND m.approved = 1
          AND (b.redirect IS NULL OR b.redirect = '')
      `;

      const totalApprox = Number(countResult[0]?.count || 0);

      const formattedMessages = accessibleMessages.map(msg => ({
        id: Number(msg.idMsg),
        subject: msg.subject || '',
        body: msg.body || '',
        posterTime: Number(msg.posterTime),
        modifiedTime: msg.modifiedTime ? Number(msg.modifiedTime) : null,
        modifiedName: msg.modifiedName,
        topic: {
          id: Number(msg.idTopic),
          subject: msg.topicSubject || 'Untitled',
          board: {
            id: Number(msg.boardId),
            name: msg.boardName
          }
        }
      }));

      return {
        user: {
          id: user.idMember,
          memberName: user.memberName,
          realName: user.realName,
          avatar: user.avatar,
          totalPosts: user.posts
        },
        messages: formattedMessages,
        pagination: {
          page,
          limit,
          total: totalApprox,
          totalPages: Math.ceil(totalApprox / limit),
          hasMore: accessibleMessages.length >= limit
        }
      };
    } catch (error) {
      this.logger.error('Error fetching user posts:', error);
      throw error;
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
          additionalGroups: true,
          memberName: true
        }
      });

      if (smfUser) {
        // User found in SMF table, use SMF groups
        const groups = [smfUser.idGroup];

        // Add post group if different from main group
        if (smfUser.idPostGroup && smfUser.idPostGroup !== smfUser.idGroup) {
          groups.push(smfUser.idPostGroup);
        }

        // Add additional groups
        if (smfUser.additionalGroups) {
          const additionalGroups = smfUser.additionalGroups
            .split(',')
            .map(g => parseInt(g.trim()))
            .filter(g => !isNaN(g) && g > 0);
          groups.push(...additionalGroups);
        }

        return [...new Set(groups)]; // Remove duplicates
      }

      // User not found in SMF table - grant administrator group as fallback for authenticated admins
      return [1]; // Administrator group for admin users not in SMF table

    } catch (error) {
      this.logger.error('Error getting user groups:', error);
      return [0]; // Default to guest group on error
    }
  }

  async createTopic(boardId: number, userId: number, subject: string, body: string, pollData?: any): Promise<any> {
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

      // Create poll if provided
      let pollId = 0;
      if (pollData) {
        pollId = await this.createPoll(pollData, userId);
      }

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
            idPoll: pollId,
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
        subject: subject,
        pollId: pollId || undefined
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
          boardName: latestMessage.topic?.board?.name || 'Unknown',  // Use topic's board, not message's board
          topicReplies: latestMessage.topic?.numReplies || 0  // Add reply count for page calculation
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

      // Get online sessions from smf_log_online table
      const onlineSessions = await this.prisma.smfLogOnline.findMany({
        where: {
          logTime: {
            gte: fifteenMinutesAgo
          }
        },
        orderBy: {
          logTime: 'desc'
        }
      });

      // Separate members from guests and deduplicate member IDs
      const memberIds = [...new Set(
        onlineSessions
          .filter(session => session.idMember > 0)
          .map(session => session.idMember)
      )];

      const guestCount = onlineSessions.filter(session => session.idMember === 0).length;

      // Get member details
      const onlineMembers = memberIds.length > 0
        ? await this.prisma.smfMember.findMany({
            where: {
              idMember: {
                in: memberIds
              }
            },
            select: {
              idMember: true,
              memberName: true,
              lastLogin: true
            }
          })
        : [];

      return {
        members: onlineMembers.map(m => ({
          id: m.idMember,
          name: m.memberName,
          lastSeen: m.lastLogin
        })),
        totalMembers: onlineMembers.length,
        totalGuests: guestCount
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

  async updateUserActivity(userId: number, actionData?: any): Promise<void> {
    try {
      const currentTime = Math.floor(Date.now() / 1000);

      // Generate a session ID based on user ID
      // In a real implementation, you'd use the actual session ID from the request
      const sessionId = `user_${userId}_${Math.floor(currentTime / 300)}`; // Changes every 5 minutes

      // Build action object with additional context
      const action: any = {
        action: actionData?.action || 'forums',
        ...(actionData?.topicId && { topic: actionData.topicId }),
        ...(actionData?.boardId && { board: actionData.boardId }),
        ...(actionData?.page && { page: actionData.page }),
      };

      // If we have a topic or board ID, fetch the title for better display
      if (actionData?.topicId) {
        try {
          const topic = await this.prisma.smfTopic.findUnique({
            where: { idTopic: actionData.topicId },
            select: {
              firstMessage: {
                select: { subject: true }
              }
            }
          });
          if (topic?.firstMessage?.subject) {
            action.topicTitle = topic.firstMessage.subject;
          }
        } catch (err) {
          // Ignore errors fetching topic details
        }
      }

      if (actionData?.boardId) {
        try {
          const board = await this.prisma.smfBoard.findUnique({
            where: { idBoard: actionData.boardId },
            select: { name: true }
          });
          if (board) {
            action.boardName = board.name;
          }
        } catch (err) {
          // Ignore errors fetching board details
        }
      }

      const urlData = JSON.stringify(action);

      // Upsert into smf_log_online table to track activity
      await this.prisma.smfLogOnline.upsert({
        where: { session: sessionId },
        update: {
          logTime: currentTime,
          url: urlData
        },
        create: {
          session: sessionId,
          logTime: currentTime,
          idMember: userId,
          idSpider: 0,
          ip: null, // Can be passed as parameter if needed
          url: urlData
        }
      });

      // Clean up old sessions (older than 15 minutes)
      const fifteenMinutesAgo = currentTime - (15 * 60);
      await this.prisma.smfLogOnline.deleteMany({
        where: {
          logTime: {
            lt: fifteenMinutesAgo
          }
        }
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
          // Check if this is the last message in the topic
          const isLastMessage = message.topic.idLastMsg === messageId;

          // Delete the message
          await prisma.smfMessage.delete({
            where: { idMsg: messageId }
          });

          // If this was the last message, find the new last message
          let updateData: any = {
            numReplies: { decrement: 1 }
          };

          if (isLastMessage) {
            // Find the new last message (most recent remaining message in this topic)
            const newLastMessage = await prisma.smfMessage.findFirst({
              where: { idTopic: message.idTopic },
              orderBy: { posterTime: 'desc' }
            });

            if (newLastMessage) {
              updateData.idLastMsg = newLastMessage.idMsg;
            }
          }

          // Update topic stats
          await prisma.smfTopic.update({
            where: { idTopic: message.idTopic },
            data: updateData
          });

          // Check if we need to update board's last message pointer
          const board = await prisma.smfBoard.findUnique({
            where: { idBoard: message.idBoard }
          });

          let boardUpdateData: any = {
            numPosts: { decrement: 1 }
          };

          // If the deleted message was the board's last message, find the new one
          if (board?.idLastMsg === messageId) {
            const newBoardLastMessage = await prisma.smfMessage.findFirst({
              where: {
                idBoard: message.idBoard,
                approved: 1
              },
              orderBy: { posterTime: 'desc' }
            });

            if (newBoardLastMessage) {
              boardUpdateData.idLastMsg = newBoardLastMessage.idMsg;
            } else {
              boardUpdateData.idLastMsg = 0;
            }
          }

          // Update board stats
          await prisma.smfBoard.update({
            where: { idBoard: message.idBoard },
            data: boardUpdateData
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

  /**
   * Fix data integrity issues for topics and boards
   * This method finds and fixes topics/boards with invalid last message pointers
   */
  async fixMessagePointers(): Promise<any> {
    try {
      const fixedTopics: number[] = [];
      const fixedBoards: number[] = [];

      // Find topics where id_last_msg points to a message in a different topic
      const brokenTopics = await this.prisma.$queryRaw<any[]>`
        SELECT t.id_topic, t.id_last_msg, m.id_topic as actual_topic
        FROM smf_topics t
        LEFT JOIN smf_messages m ON t.id_last_msg = m.id_msg
        WHERE m.id_topic IS NULL OR m.id_topic != t.id_topic
      `;

      this.logger.log(`Found ${brokenTopics.length} topics with invalid last message pointers`);

      // Fix each broken topic
      for (const topic of brokenTopics) {
        const newLastMessage = await this.prisma.smfMessage.findFirst({
          where: { idTopic: topic.id_topic },
          orderBy: { posterTime: 'desc' }
        });

        if (newLastMessage) {
          await this.prisma.smfTopic.update({
            where: { idTopic: topic.id_topic },
            data: { idLastMsg: newLastMessage.idMsg }
          });
          fixedTopics.push(topic.id_topic);
          this.logger.log(`Fixed topic ${topic.id_topic}: ${topic.id_last_msg} -> ${newLastMessage.idMsg}`);
        }
      }

      // Find boards where id_last_msg points to a message in a different board
      const brokenBoards = await this.prisma.$queryRaw<any[]>`
        SELECT b.id_board, b.id_last_msg, m.id_board as actual_board
        FROM smf_boards b
        LEFT JOIN smf_messages m ON b.id_last_msg = m.id_msg
        WHERE b.id_last_msg > 0
        AND (m.id_board IS NULL OR m.id_board != b.id_board)
      `;

      this.logger.log(`Found ${brokenBoards.length} boards with invalid last message pointers`);

      // Fix each broken board
      for (const board of brokenBoards) {
        const newLastMessage = await this.prisma.smfMessage.findFirst({
          where: {
            idBoard: board.id_board,
            approved: 1
          },
          orderBy: { posterTime: 'desc' }
        });

        const newLastMsgId = newLastMessage ? newLastMessage.idMsg : 0;

        await this.prisma.smfBoard.update({
          where: { idBoard: board.id_board },
          data: { idLastMsg: newLastMsgId }
        });
        fixedBoards.push(board.id_board);
        this.logger.log(`Fixed board ${board.id_board}: ${board.id_last_msg} -> ${newLastMsgId}`);
      }

      return {
        success: true,
        fixedTopicsCount: fixedTopics.length,
        fixedBoardsCount: fixedBoards.length,
        fixedTopics,
        fixedBoards
      };
    } catch (error) {
      this.logger.error('Error fixing message pointers:', error);
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

  // Poll methods
  async getPollData(pollId: number, userId?: number): Promise<any> {
    try {
      const poll = await this.prisma.smfPoll.findUnique({
        where: { idPoll: pollId },
        include: {
          choices: {
            orderBy: { idChoice: 'asc' }
          },
          votes: userId ? {
            where: { idMember: userId }
          } : false
        }
      });

      if (!poll) {
        return null;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = poll.expireTime > 0 && currentTime > poll.expireTime;
      const userVotes = userId ? poll.votes?.map(v => v.idChoice) || [] : [];
      const userVoted = userVotes.length > 0;

      // Calculate total votes
      const totalVotes = poll.choices.reduce((sum, choice) => sum + choice.votes, 0);

      const choices = poll.choices.map(choice => ({
        id: choice.idChoice,
        label: choice.label,
        votes: choice.votes,
        percentage: totalVotes > 0 ? Math.round((choice.votes / totalVotes) * 100) : 0,
        isUserChoice: userVotes.includes(choice.idChoice)
      }));

      // Calculate if user can view results based on hide_results setting
      // 0 = always visible, 1 = after voting, 2 = after poll expires
      let canViewResults = true;
      if (poll.hideResults === 1) {
        // Hide until user votes (or poll expires)
        canViewResults = userVoted || isExpired;
      } else if (poll.hideResults === 2) {
        // Hide until poll expires
        canViewResults = isExpired;
      }

      return {
        id: poll.idPoll,
        question: poll.question,
        votingLocked: poll.votingLocked,
        maxVotes: poll.maxVotes,
        expireTime: poll.expireTime,
        hideResults: poll.hideResults,
        changeVote: poll.changeVote,
        guestVote: poll.guestVote,
        totalVotes,
        totalVoters: await this.prisma.smfLogPoll.groupBy({
          by: ['idMember'],
          where: { idPoll: pollId }
        }).then(groups => groups.length),
        choices,
        userVoted,
        userChoices: userVoted ? userVotes : undefined,
        canVote: !isExpired && !poll.votingLocked && (!userVoted || poll.changeVote === 1),
        canViewResults,
        isExpired
      };
    } catch (error) {
      this.logger.error('Error getting poll data:', error);
      throw error;
    }
  }

  async votePoll(pollId: number, userId: number, choices: number[]): Promise<any> {
    try {
      const poll = await this.prisma.smfPoll.findUnique({
        where: { idPoll: pollId },
        include: {
          votes: {
            where: { idMember: userId }
          }
        }
      });

      if (!poll) {
        throw new NotFoundException('Sondage introuvable');
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = poll.expireTime > 0 && currentTime > poll.expireTime;

      if (isExpired) {
        throw new BadRequestException('Le sondage a expiré');
      }

      if (poll.votingLocked) {
        throw new ForbiddenException('Le sondage est verrouillé');
      }

      const userHasVoted = poll.votes.length > 0;

      if (userHasVoted && !poll.changeVote) {
        throw new BadRequestException('Vous avez déjà voté et ne pouvez pas modifier votre vote');
      }

      if (choices.length > poll.maxVotes) {
        throw new BadRequestException(`Vous ne pouvez sélectionner que ${poll.maxVotes} choix maximum`);
      }

      // Execute vote in transaction
      await this.prisma.$transaction(async (prisma) => {
        // If user has voted before and can change vote, remove old votes
        if (userHasVoted) {
          const oldChoices = poll.votes.map(v => v.idChoice);

          // Remove old vote log entries
          await prisma.smfLogPoll.deleteMany({
            where: {
              idPoll: pollId,
              idMember: userId
            }
          });

          // Decrement vote counts for old choices
          for (const oldChoice of oldChoices) {
            await prisma.smfPollChoice.update({
              where: {
                idPoll_idChoice: {
                  idPoll: pollId,
                  idChoice: oldChoice
                }
              },
              data: {
                votes: { decrement: 1 }
              }
            });
          }
        }

        // Add new votes
        for (const choiceId of choices) {
          // Add vote log
          await prisma.smfLogPoll.create({
            data: {
              idPoll: pollId,
              idMember: userId,
              idChoice: choiceId
            }
          });

          // Increment vote count
          await prisma.smfPollChoice.update({
            where: {
              idPoll_idChoice: {
                idPoll: pollId,
                idChoice: choiceId
              }
            },
            data: {
              votes: { increment: 1 }
            }
          });
        }
      });

      this.logger.log(`User ${userId} voted on poll ${pollId} with choices: ${choices.join(', ')}`);

      // Return updated poll data
      return this.getPollData(pollId, userId);
    } catch (error) {
      this.logger.error('Error voting on poll:', error);
      throw error;
    }
  }

  async getPollVoters(pollId: number): Promise<any> {
    try {
      // Get unique member IDs who voted on this poll
      const voteRecords = await this.prisma.smfLogPoll.findMany({
        where: { idPoll: pollId },
        select: { idMember: true },
        distinct: ['idMember']
      });

      const memberIds = voteRecords.map(v => v.idMember);

      // Get member details
      const members = await this.prisma.smfMember.findMany({
        where: {
          idMember: { in: memberIds }
        },
        select: {
          idMember: true,
          memberName: true,
          realName: true
        }
      });

      return {
        pollId,
        totalVoters: members.length,
        voters: members.map(m => ({
          id: m.idMember,
          username: m.memberName,
          realName: m.realName
        }))
      };
    } catch (error) {
      this.logger.error('Error getting poll voters:', error);
      throw error;
    }
  }

  async createPoll(pollData: any, userId: number): Promise<number> {
    try {
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { memberName: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get next poll ID
      const lastPoll = await this.prisma.smfPoll.findFirst({
        orderBy: { idPoll: 'desc' },
        select: { idPoll: true }
      });
      const nextPollId = (lastPoll?.idPoll || 0) + 1;

      // Create poll and choices in transaction
      await this.prisma.$transaction(async (prisma) => {
        // Create poll
        await prisma.smfPoll.create({
          data: {
            idPoll: nextPollId,
            question: pollData.question,
            votingLocked: 0,
            maxVotes: pollData.maxVotes || 1,
            expireTime: pollData.expireTime || 0,
            hideResults: pollData.hideResults || 0,
            changeVote: pollData.changeVote ? 1 : 0,
            guestVote: pollData.guestVote ? 1 : 0,
            numGuestVoters: 0,
            resetPoll: 0,
            idMember: userId,
            posterName: user.memberName
          }
        });

        // Create poll choices
        for (let i = 0; i < pollData.choices.length; i++) {
          await prisma.smfPollChoice.create({
            data: {
              idPoll: nextPollId,
              idChoice: i,
              label: pollData.choices[i].label,
              votes: 0
            }
          });
        }
      });

      this.logger.log(`Poll ${nextPollId} created by user ${userId}`);
      return nextPollId;
    } catch (error) {
      this.logger.error('Error creating poll:', error);
      throw error;
    }
  }

  // Unread messages functionality
  async getUnreadTopics(userId: number, boardId?: number, limit: number = 20, offset: number = 0): Promise<any> {
    try {
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { lastLogin: true, previousLogin: true }
      });

      if (!user) {
        return { topics: [], total: 0, limit, offset };
      }

      // Use previousLogin if available, otherwise fall back to lastLogin
      const referenceTime = user.previousLogin || user.lastLogin;

      if (!referenceTime) {
        return { topics: [], total: 0, limit, offset };
      }

      const whereClause: any = {
        idLastMsg: {
          gt: 0
        },
        lastMessage: {
          posterTime: {
            gt: referenceTime
          }
        }
      };

      if (boardId) {
        whereClause.idBoard = boardId;
      }

      // Check board access
      const [topics, totalTopics] = await Promise.all([
        this.prisma.smfTopic.findMany({
          where: whereClause,
          skip: offset,
          take: limit,
          orderBy: [
            { isSticky: 'desc' },
            { idLastMsg: 'desc' }
          ],
          include: {
            firstMessage: true,
            lastMessage: {
              include: {
                member: true
              }
            },
            board: {
              include: {
                category: true
              }
            },
            starter: true
          }
        }),
        this.prisma.smfTopic.count({
          where: whereClause
        })
      ]);

      // Filter by board access
      const accessibleTopics: any[] = [];
      for (const topic of topics) {
        const hasAccess = await this.checkBoardAccess(topic.idBoard, userId);
        if (hasAccess) {
          accessibleTopics.push({
            id: topic.idTopic,
            subject: topic.firstMessage?.subject || 'Untitled',
            isSticky: Boolean(topic.isSticky),
            locked: Boolean(topic.locked),
            hasPoll: topic.idPoll > 0,
            numReplies: topic.numReplies,
            numViews: topic.numViews,
            board: {
              id: topic.board.idBoard,
              name: topic.board.name,
              categoryName: topic.board.category.name
            },
            starter: {
              id: topic.starter?.idMember || 0,
              name: topic.starter?.memberName || topic.firstMessage?.posterName || 'Unknown'
            },
            lastMessage: topic.lastMessage ? {
              id: topic.lastMessage.idMsg,
              time: topic.lastMessage.posterTime,
              author: topic.lastMessage.member?.memberName || topic.lastMessage.posterName,
              isNew: topic.lastMessage.posterTime > referenceTime
            } : null,
            firstMessageTime: topic.firstMessage?.posterTime || 0
          });
        }
      }

      return {
        topics: accessibleTopics,
        total: totalTopics,
        limit,
        offset,
        lastLoginTime: user.lastLogin
      };
    } catch (error) {
      this.logger.error('Error fetching unread topics:', error);
      return { topics: [], total: 0, limit, offset };
    }
  }

  async getUnreadCount(userId: number): Promise<{ count: number }> {
    try {
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { lastLogin: true }
      });

      if (!user || !user.lastLogin) {
        return { count: 0 };
      }

      // Get all boards user has access to
      const categories = await this.getCategories(userId);
      const boardIds = categories.flatMap(cat => cat.boards.map(b => b.id));

      if (boardIds.length === 0) {
        return { count: 0 };
      }

      // Count topics with new messages since last login
      const count = await this.prisma.smfTopic.count({
        where: {
          idBoard: {
            in: boardIds
          },
          lastMessage: {
            posterTime: {
              gt: user.lastLogin
            }
          }
        }
      });

      return { count };
    } catch (error) {
      this.logger.error('Error getting unread count:', error);
      return { count: 0 };
    }
  }

  async markTopicAsRead(topicId: number, userId: number): Promise<{ success: boolean }> {
    try {
      // TODO: Implement proper read tracking using smf_log_topics table
      // DO NOT update lastLogin here - it breaks unread message detection
      // lastLogin should ONLY be updated during actual login (auth.service.ts)

      // For now, just return successfully
      // Proper topic read tracking will be implemented with smf_log_topics table
      return { success: true };
    } catch (error) {
      this.logger.error('Error marking topic as read:', error);
      return { success: false };
    }
  }

  async markAllAsRead(userId: number): Promise<{ success: boolean }> {
    try {
      // Update lastLogin to current time so all previous messages appear as read
      // This is the ONLY legitimate use case for updating lastLogin outside of actual login
      const currentTime = Math.floor(Date.now() / 1000);

      await this.prisma.smfMember.update({
        where: { idMember: userId },
        data: { lastLogin: currentTime }
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error marking all as read:', error);
      return { success: false };
    }
  }

  async searchForums(searchQuery: string, limit: number, offset: number, userId?: number) {
    try {
      const searchTerm = `%${searchQuery}%`;

      // Search in both topics (first message) and regular messages
      // Fetch more than needed to account for filtering
      const messages = await this.prisma.smfMessage.findMany({
        where: {
          OR: [
            { subject: { contains: searchQuery, mode: 'insensitive' } },
            { body: { contains: searchQuery, mode: 'insensitive' } }
          ],
          // Exclude deleted messages
          approved: 1
        },
        include: {
          topic: {
            include: {
              board: {
                include: {
                  category: true
                }
              }
            }
          }
        },
        orderBy: { posterTime: 'desc' },
        take: limit * 3, // Fetch 3x to account for filtered results
        skip: offset
      });

      // Filter by board access
      const accessibleMessages: any[] = [];
      for (const msg of messages) {
        if (msg.topic?.board?.idBoard) {
          const hasAccess = await this.checkBoardAccess(msg.topic.board.idBoard, userId);
          if (hasAccess) {
            accessibleMessages.push(msg);
            if (accessibleMessages.length >= limit) {
              break; // Stop once we have enough results
            }
          }
        }
      }

      // Get total count of all matching messages (for pagination estimate)
      // Note: This is an approximation since we can't efficiently count accessible boards
      const totalCount = accessibleMessages.length >= limit
        ? offset + accessibleMessages.length + 1 // Suggest there may be more
        : offset + accessibleMessages.length; // No more results

      // Format results with message position calculation
      const results = await Promise.all(accessibleMessages.map(async (msg) => {
        // Create excerpt from body (remove BBCode tags and limit length)
        let cleanBody = msg.body
          .replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, '') // Remove quotes first
          .replace(/\[spoiler[^\]]*\][\s\S]*?\[\/spoiler\]/gi, '[Spoiler]') // Replace spoilers with marker
          .replace(/\[code\][\s\S]*?\[\/code\]/gi, '[Code]') // Replace code blocks with marker
          .replace(/\[img[^\]]*\][^\[]*\[\/img\]/gi, '[Image]') // Replace images with marker
          .replace(/\[url[^\]]*\][^\[]*\[\/url\]/gi, '') // Remove URL tags but keep text
          .replace(/\[.*?\]/g, '') // Remove all other BBCode tags
          .replace(/&nbsp;/g, ' ') // Replace HTML entities
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/\s+/g, ' ')    // Normalize whitespace
          .trim();

        const excerpt = cleanBody.length > 200
          ? cleanBody.substring(0, 200) + '...'
          : cleanBody;

        // Calculate message position in topic (for pagination)
        const messagePosition = await this.prisma.smfMessage.count({
          where: {
            idTopic: msg.idTopic,
            posterTime: {
              lte: msg.posterTime
            },
            idMsg: {
              lte: msg.idMsg // Include messages at same time but with lower ID
            }
          }
        });

        return {
          id: msg.idMsg,
          subject: msg.subject,
          excerpt: excerpt,
          posterName: msg.posterName,
          posterTime: msg.posterTime,
          topicId: msg.idTopic,
          messagePosition: messagePosition, // Position in topic (1-indexed)
          numReplies: msg.topic?.numReplies || 0,
          numViews: msg.topic?.numViews || 0,
          isSticky: msg.topic?.isSticky === 1,
          locked: msg.topic?.locked === 1,
          board: {
            id: msg.topic?.board?.idBoard,
            name: msg.topic?.board?.name,
            categoryName: msg.topic?.board?.category?.name
          }
        };
      }));

      return {
        results,
        total: totalCount
      };
    } catch (error) {
      this.logger.error('Error searching forums:', error);
      return { results: [], total: 0 };
    }
  }

  /**
   * Get the page number where a specific message appears in its topic
   * Used for navigating directly to a message from reports/links
   */
  async getMessagePage(messageId: number, userId?: number): Promise<{ page: number; topicId: number; messagePosition: number }> {
    try {
      // Get the message with topic info
      const message = await this.prisma.smfMessage.findUnique({
        where: { idMsg: messageId },
        select: {
          idMsg: true,
          idTopic: true,
          idBoard: true,
          posterTime: true
        }
      });

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      // Check board access if user is provided
      if (userId) {
        const hasAccess = await this.checkBoardAccess(message.idBoard, userId);
        if (!hasAccess) {
          throw new ForbiddenException('Access denied to this board');
        }
      }

      // Calculate the message's position in the topic (1-indexed)
      // Count all messages in the topic that come before or at the same time as this message
      const messagePosition = await this.prisma.smfMessage.count({
        where: {
          idTopic: message.idTopic,
          OR: [
            { posterTime: { lt: message.posterTime } },
            {
              AND: [
                { posterTime: message.posterTime },
                { idMsg: { lte: message.idMsg } }
              ]
            }
          ]
        }
      });

      // Calculate page number (15 messages per page, matching the frontend)
      const messagesPerPage = 15;
      const page = Math.ceil(messagePosition / messagesPerPage);

      this.logger.log(`Message ${messageId} is at position ${messagePosition} in topic ${message.idTopic}, page ${page}`);

      return {
        page,
        topicId: message.idTopic,
        messagePosition
      };
    } catch (error) {
      this.logger.error('Error getting message page:', error);
      throw error;
    }
  }
}