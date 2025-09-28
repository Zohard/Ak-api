import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { MySqlService } from '../../shared/services/mysql.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesDto, SearchMessagesDto, MarkReadDto } from './dto/get-messages.dto';
import { SmfMessage, MessageUser, MessageResponse, ConversationMessage } from './interfaces/message.interface';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly mysqlService: MySqlService) {}

  async sendMessage(createMessageDto: CreateMessageDto): Promise<MessageResponse> {
    const { senderId, recipientId, subject, message, threadId } = createMessageDto;

    try {
      return await this.mysqlService.transaction(async (connection) => {
        // Get sender info
        const [senderRows] = await connection.execute(
          'SELECT member_name, real_name FROM smf_members WHERE id_member = ?',
          [senderId]
        );

        if (!senderRows || (senderRows as any[]).length === 0) {
          throw new NotFoundException('Sender not found');
        }

        const sender = (senderRows as any[])[0];
        const senderName = sender.real_name || sender.member_name;
        const msgTime = Math.floor(Date.now() / 1000);
        const pmHead = threadId || 0;

        // Insert message
        const [messageResult] = await connection.execute(`
          INSERT INTO smf_personal_messages
          (id_pm_head, id_member_from, from_name, msgtime, subject, body)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [pmHead, senderId, senderName, msgTime, subject, message]);

        const messageId = (messageResult as any).insertId;

        // If this is the first message in a thread, update the pm_head
        if (!threadId) {
          await connection.execute(
            'UPDATE smf_personal_messages SET id_pm_head = ? WHERE id_pm = ?',
            [messageId, messageId]
          );
        }

        // Add recipient
        await connection.execute(`
          INSERT INTO smf_pm_recipients
          (id_pm, id_member, bcc, is_read, is_new, deleted, in_inbox)
          VALUES (?, ?, 0, 0, 1, 0, 1)
        `, [messageId, recipientId]);

        // Update recipient's message counts
        await connection.execute(`
          UPDATE smf_members
          SET instant_messages = instant_messages + 1,
              unread_messages = unread_messages + 1,
              new_pm = 1
          WHERE id_member = ?
        `, [recipientId]);

        return {
          success: true,
          messageId,
          threadId: threadId || messageId
        };
      });
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw new BadRequestException('Failed to send message');
    }
  }

  async getMessages(getMessagesDto: GetMessagesDto): Promise<SmfMessage[]> {
    const { userId, type, limit, offset } = getMessagesDto;

    try {
      if (type === 'inbox') {
        return await this.getInboxMessages(userId, limit, offset);
      } else {
        return await this.getSentMessages(userId, limit, offset);
      }
    } catch (error) {
      this.logger.error('Failed to get messages:', error);
      throw new BadRequestException('Failed to retrieve messages');
    }
  }

  private async getInboxMessages(userId: number, limit: number, offset: number): Promise<SmfMessage[]> {
    const query = `
      SELECT
        pm.id_pm as id,
        pm.id_pm_head as thread_id,
        pm.id_member_from as sender_id,
        pm.from_name as sender_name,
        sender.member_name as sender_username,
        pm.subject,
        pm.body as message,
        FROM_UNIXTIME(pm.msgtime) as created_at,
        pm.msgtime as timestamp,
        pr.is_read,
        pr.is_new,
        pr.bcc
      FROM smf_personal_messages pm
      JOIN smf_pm_recipients pr ON pm.id_pm = pr.id_pm
      LEFT JOIN smf_members sender ON pm.id_member_from = sender.id_member
      WHERE pr.id_member = ?
        AND pr.deleted = 0
        AND pr.in_inbox = 1
      ORDER BY pm.msgtime DESC
      LIMIT ? OFFSET ?
    `;

    return await this.mysqlService.query<SmfMessage>(query, [userId, limit, offset]);
  }

  private async getSentMessages(userId: number, limit: number, offset: number): Promise<SmfMessage[]> {
    const query = `
      SELECT DISTINCT
        pm.id_pm as id,
        pm.id_pm_head as thread_id,
        pm.subject,
        pm.body as message,
        FROM_UNIXTIME(pm.msgtime) as created_at,
        pm.msgtime as timestamp,
        GROUP_CONCAT(DISTINCT recipient.member_name) as recipients
      FROM smf_personal_messages pm
      JOIN smf_pm_recipients pr ON pm.id_pm = pr.id_pm
      LEFT JOIN smf_members recipient ON pr.id_member = recipient.id_member
      WHERE pm.id_member_from = ?
        AND pm.deleted_by_sender = 0
      GROUP BY pm.id_pm
      ORDER BY pm.msgtime DESC
      LIMIT ? OFFSET ?
    `;

    return await this.mysqlService.query<SmfMessage>(query, [userId, limit, offset]);
  }

  async getConversationThread(threadId: number, userId: number): Promise<ConversationMessage[]> {
    const query = `
      SELECT
        pm.id_pm as id,
        pm.id_pm_head as thread_id,
        pm.id_member_from as sender_id,
        pm.from_name as sender_name,
        sender.member_name as sender_username,
        pm.subject,
        pm.body as message,
        FROM_UNIXTIME(pm.msgtime) as created_at,
        pr.is_read,
        pr.id_member as recipient_id,
        recipient.member_name as recipient_username
      FROM smf_personal_messages pm
      JOIN smf_pm_recipients pr ON pm.id_pm = pr.id_pm
      LEFT JOIN smf_members sender ON pm.id_member_from = sender.id_member
      LEFT JOIN smf_members recipient ON pr.id_member = recipient.id_member
      WHERE pm.id_pm_head = ?
        AND (pm.id_member_from = ? OR pr.id_member = ?)
        AND ((pm.id_member_from = ? AND pm.deleted_by_sender = 0) OR
             (pr.id_member = ? AND pr.deleted = 0))
      ORDER BY pm.msgtime ASC
    `;

    try {
      return await this.mysqlService.query<ConversationMessage>(
        query,
        [threadId, userId, userId, userId, userId]
      );
    } catch (error) {
      this.logger.error('Failed to get conversation thread:', error);
      throw new BadRequestException('Failed to retrieve conversation');
    }
  }

  async markAsRead(markReadDto: MarkReadDto): Promise<void> {
    const { messageId, userId } = markReadDto;

    try {
      await this.mysqlService.transaction(async (connection) => {
        await connection.execute(`
          UPDATE smf_pm_recipients
          SET is_read = 1, is_new = 0
          WHERE id_pm = ? AND id_member = ?
        `, [messageId, userId]);

        // Update user's unread count
        await connection.execute(`
          UPDATE smf_members
          SET unread_messages = GREATEST(0, unread_messages - 1)
          WHERE id_member = ?
        `, [userId]);
      });
    } catch (error) {
      this.logger.error('Failed to mark message as read:', error);
      throw new BadRequestException('Failed to mark message as read');
    }
  }

  async getUnreadCount(userId: number): Promise<number> {
    try {
      const results = await this.mysqlService.query<{ unread_messages: number }>(
        'SELECT unread_messages FROM smf_members WHERE id_member = ?',
        [userId]
      );

      return results.length > 0 ? results[0].unread_messages : 0;
    } catch (error) {
      this.logger.error('Failed to get unread count:', error);
      throw new BadRequestException('Failed to get unread count');
    }
  }

  async searchMessages(searchDto: SearchMessagesDto): Promise<SmfMessage[]> {
    const { userId, searchTerm, limit, offset } = searchDto;
    const searchPattern = `%${searchTerm}%`;

    const query = `
      SELECT DISTINCT
        pm.id_pm as id,
        pm.id_pm_head as thread_id,
        pm.id_member_from as sender_id,
        pm.from_name as sender_name,
        pm.subject,
        pm.body as message,
        FROM_UNIXTIME(pm.msgtime) as created_at,
        CASE
          WHEN pm.id_member_from = ? THEN 'sent'
          ELSE 'received'
        END as type
      FROM smf_personal_messages pm
      LEFT JOIN smf_pm_recipients pr ON pm.id_pm = pr.id_pm
      WHERE (pm.subject LIKE ? OR pm.body LIKE ?)
        AND (
          (pm.id_member_from = ? AND pm.deleted_by_sender = 0) OR
          (pr.id_member = ? AND pr.deleted = 0)
        )
      ORDER BY pm.msgtime DESC
      LIMIT ? OFFSET ?
    `;

    try {
      return await this.mysqlService.query<SmfMessage>(
        query,
        [userId, searchPattern, searchPattern, userId, userId, limit, offset]
      );
    } catch (error) {
      this.logger.error('Failed to search messages:', error);
      throw new BadRequestException('Failed to search messages');
    }
  }

  async getUsers(searchTerm?: string, limit: number = 50): Promise<MessageUser[]> {
    let query = `
      SELECT
        id_member as id,
        member_name as username,
        real_name as displayName
      FROM smf_members
      WHERE id_member > 0
    `;
    const params: any[] = [];

    if (searchTerm) {
      query += ' AND (member_name LIKE ? OR real_name LIKE ?)';
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ' ORDER BY member_name LIMIT ?';
    params.push(limit);

    try {
      return await this.mysqlService.query<MessageUser>(query, params);
    } catch (error) {
      this.logger.error('Failed to get users:', error);
      throw new BadRequestException('Failed to retrieve users');
    }
  }
}