import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ForumMessageQueryDto, ForumMessage, ForumMessageResponse } from './dto/forum-message.dto';

@Injectable()
export class ForumsService {
  private readonly logger = new Logger(ForumsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}