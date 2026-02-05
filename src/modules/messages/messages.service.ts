import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { EmailService } from '../../shared/services/email.service';
import { EncryptionService } from '../../shared/services/encryption.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesDto, SearchMessagesDto, MarkReadDto, DeleteMessageDto } from './dto/get-messages.dto';
import { SmfMessage, MessageUser, MessageResponse, ConversationMessage } from './interfaces/message.interface';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async sendMessage(createMessageDto: CreateMessageDto): Promise<MessageResponse> {
    const { senderId, recipientId, subject, message, threadId, bccRecipientIds, conversationUrl } = createMessageDto;

    // Encrypt message body before storing
    const encryptedMessage = this.encryptionService.encrypt(message);

    try {
      const result = await this.prisma.$transaction(async (prisma) => {
        // Get sender info
        const sender = await prisma.smfMember.findUnique({
          where: { idMember: senderId },
          select: { memberName: true, realName: true }
        });

        if (!sender) {
          throw new NotFoundException('Sender not found');
        }

        // Get recipient info for email notification
        const recipient = await prisma.smfMember.findUnique({
          where: { idMember: recipientId },
          select: {
            memberName: true,
            realName: true,
            emailAddress: true
          }
        });

        if (!recipient) {
          throw new NotFoundException('Recipient not found');
        }

        const senderName = sender.realName || sender.memberName;
        const msgTime = Math.floor(Date.now() / 1000);

        // FIXED: Create message with proper idPmHead handling
        let newMessage;

        if (threadId) {
          // If replying to existing thread, use the threadId
          newMessage = await prisma.smfPersonalMessage.create({
            data: {
              idPmHead: threadId,
              idMemberFrom: senderId,
              fromName: senderName,
              msgtime: msgTime,
              subject,
              body: encryptedMessage, // Store encrypted message
              deletedBySender: 0
            }
          });
        } else {
          // For new conversation, we need to create the message first
          // Then update idPmHead to match its own idPm
          // This avoids the constraint issue by only creating once
          newMessage = await prisma.smfPersonalMessage.create({
            data: {
              idPmHead: 0, // Temporary value
              idMemberFrom: senderId,
              fromName: senderName,
              msgtime: msgTime,
              subject,
              body: encryptedMessage, // Store encrypted message
              deletedBySender: 0,
              conversationUrl: conversationUrl || null
            }
          });

          // Update idPmHead to match the newly created idPm
          newMessage = await prisma.smfPersonalMessage.update({
            where: { idPm: newMessage.idPm },
            data: { idPmHead: newMessage.idPm }
          });
        }

        const messageId = newMessage.idPm;
        const finalThreadId = threadId || messageId;

        // Add main recipient (not BCC)
        await prisma.smfPmRecipient.create({
          data: {
            idPm: messageId,
            idMember: recipientId,
            bcc: 0,
            isRead: 0,
            isNew: 1,
            deleted: 0
          }
        });

        // Update main recipient's message counts
        await prisma.smfMember.update({
          where: { idMember: recipientId },
          data: {
            instantMessages: { increment: 1 },
            unreadMessages: { increment: 1 },
            newPm: 1
          }
        });

        // Add BCC recipients if any
        const bccRecipientEmails: Array<{ email: string; username: string }> = [];
        if (bccRecipientIds && bccRecipientIds.length > 0) {
          for (const bccRecipientId of bccRecipientIds) {
            // Skip if BCC recipient is same as main recipient or sender
            if (bccRecipientId === recipientId || bccRecipientId === senderId) {
              continue;
            }

            // Get BCC recipient info
            const bccRecipient = await prisma.smfMember.findUnique({
              where: { idMember: bccRecipientId },
              select: {
                memberName: true,
                realName: true,
                emailAddress: true
              }
            });

            if (!bccRecipient) {
              this.logger.warn(`BCC recipient ${bccRecipientId} not found, skipping`);
              continue;
            }

            // Create recipient record with BCC flag
            await prisma.smfPmRecipient.create({
              data: {
                idPm: messageId,
                idMember: bccRecipientId,
                bcc: 1, // Mark as BCC
                isRead: 0,
                isNew: 1,
                deleted: 0
              }
            });

            // Update BCC recipient's message counts
            await prisma.smfMember.update({
              where: { idMember: bccRecipientId },
              data: {
                instantMessages: { increment: 1 },
                unreadMessages: { increment: 1 },
                newPm: 1
              }
            });

            // Collect BCC recipient email info for notifications
            if (bccRecipient.emailAddress) {
              bccRecipientEmails.push({
                email: bccRecipient.emailAddress,
                username: bccRecipient.realName || bccRecipient.memberName
              });
            }
          }
        }

        return {
          success: true,
          messageId,
          threadId: finalThreadId,
          recipientEmail: recipient.emailAddress,
          recipientUsername: recipient.realName || recipient.memberName,
          senderName,
          bccRecipientEmails
        };
      });

      // Send email notification to main recipient asynchronously (don't wait for it)
      if (result.recipientEmail) {
        this.emailService.sendPrivateMessageNotification(
          result.recipientEmail,
          result.recipientUsername,
          result.senderName,
          subject,
          message,
        ).catch(err => {
          this.logger.error('Failed to send PM email notification:', err);
        });
      }

      // Send email notifications to BCC recipients asynchronously
      if (result.bccRecipientEmails && result.bccRecipientEmails.length > 0) {
        for (const bccRecipient of result.bccRecipientEmails) {
          this.emailService.sendPrivateMessageNotification(
            bccRecipient.email,
            bccRecipient.username,
            result.senderName,
            subject,
            message,
          ).catch(err => {
            this.logger.error(`Failed to send BCC PM email notification to ${bccRecipient.username}:`, err);
          });
        }
      }

      return {
        success: result.success,
        messageId: result.messageId,
        threadId: result.threadId
      };
    } catch (error) {
      this.logger.error('Failed to send message:', error);

      // Provide more specific error information
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error.code === 'P2002') {
        this.logger.error('Unique constraint violation - possible sequence issue', error);
        throw new BadRequestException('Message creation failed due to a database constraint. Please try again.');
      }

      throw new BadRequestException('Failed to send message');
    }
  }

  /**
   * Utility method to fix the idPm sequence if it gets out of sync
   * Call this method via an admin endpoint if you encounter sequence issues
   */
  async fixMessageSequence(): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('smf_personal_messages', 'id_pm'),
          COALESCE((SELECT MAX(id_pm) FROM smf_personal_messages), 1),
          true
        );
      `);

      this.logger.log('Message sequence successfully reset');
      return {
        success: true,
        message: 'Message ID sequence has been synchronized with the database'
      };
    } catch (error) {
      this.logger.error('Failed to fix message sequence:', error);
      throw new BadRequestException('Failed to fix message sequence');
    }
  }

  async getMessages(getMessagesDto: GetMessagesDto & { importantOnly?: boolean }): Promise<SmfMessage[]> {
    const { userId, type, limit = 20, offset = 0, importantOnly = false } = getMessagesDto;

    // userId should always be provided at this point from the controller
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      if (type === 'inbox') {
        return await this.getInboxMessages(userId, limit, offset, importantOnly);
      } else {
        return await this.getSentMessages(userId, limit, offset);
      }
    } catch (error) {
      this.logger.error('Failed to get messages:', error);
      throw new BadRequestException('Failed to retrieve messages');
    }
  }

  private async getInboxMessages(userId: number, limit: number, offset: number, importantOnly: boolean = false): Promise<SmfMessage[]> {
    const recipientFilter: any = {
      idMember: userId,
      deleted: 0
    };

    if (importantOnly) {
      recipientFilter.isImportant = 1;
    }

    const messages = await this.prisma.smfPersonalMessage.findMany({
      where: {
        recipients: {
          some: recipientFilter
        }
      },
      include: {
        sender: {
          select: {
            memberName: true
          }
        },
        recipients: {
          where: {
            idMember: userId,
            deleted: 0
          }
        }
      },
      orderBy: {
        msgtime: 'desc'
      },
      skip: offset,
      take: limit
    });

    return messages.map(message => {
      const recipient = message.recipients[0]; // Should only be one recipient for this user
      return {
        id: message.idPm,
        thread_id: message.idPmHead,
        sender_id: message.idMemberFrom,
        sender_name: message.fromName,
        sender_username: message.sender?.memberName || message.fromName, // Handle system messages with no sender
        subject: message.subject,
        message: this.encryptionService.decrypt(message.body), // Decrypt message body
        created_at: new Date(message.msgtime * 1000).toISOString(),
        timestamp: message.msgtime,
        is_read: recipient?.isRead || 0,
        is_new: recipient?.isNew || 0,
        bcc: recipient?.bcc || 0,
        is_important: recipient?.isImportant || 0
      };
    });
  }

  private async getSentMessages(userId: number, limit: number, offset: number): Promise<SmfMessage[]> {
    const messages = await this.prisma.smfPersonalMessage.findMany({
      where: {
        idMemberFrom: userId,
        deletedBySender: 0
      },
      include: {
        recipients: {
          include: {
            member: {
              select: {
                memberName: true
              }
            }
          }
        }
      },
      orderBy: {
        msgtime: 'desc'
      },
      skip: offset,
      take: limit
    });

    return messages.map(message => ({
      id: message.idPm,
      thread_id: message.idPmHead,
      sender_id: message.idMemberFrom,
      sender_name: message.fromName,
      subject: message.subject,
      message: this.encryptionService.decrypt(message.body), // Decrypt message body
      created_at: new Date(message.msgtime * 1000).toISOString(),
      timestamp: message.msgtime,
      is_read: message.recipients[0]?.isRead || 0,
      is_new: message.recipients[0]?.isNew || 0,
      recipients: message.recipients.map(r => r.member.memberName).join(', ')
    }));
  }

  async getConversationThread(threadId: number, userId: number): Promise<ConversationMessage[]> {
    try {
      const messages = await this.prisma.smfPersonalMessage.findMany({
        where: {
          idPmHead: threadId,
          OR: [
            {
              idMemberFrom: userId,
              deletedBySender: 0
            },
            {
              recipients: {
                some: {
                  idMember: userId,
                  deleted: 0
                }
              }
            }
          ]
        },
        include: {
          sender: {
            select: {
              memberName: true
            }
          },
          recipients: {
            include: {
              member: {
                select: {
                  memberName: true
                }
              }
            }
          }
        },
        orderBy: {
          msgtime: 'asc'
        }
      });

      return messages.map(message => ({
        id: message.idPm,
        thread_id: message.idPmHead,
        sender_id: message.idMemberFrom,
        sender_name: message.fromName,
        sender_username: message.sender?.memberName || message.fromName, // Handle system messages
        subject: message.subject,
        message: this.encryptionService.decrypt(message.body), // Decrypt message body
        created_at: new Date(message.msgtime * 1000).toISOString(),
        is_read: message.recipients.find(r => r.idMember === userId)?.isRead || 0,
        recipient_id: message.recipients[0]?.idMember || 0,
        recipient_username: message.recipients[0]?.member?.memberName || '',
        conversation_url: message.conversationUrl || undefined
      }));
    } catch (error) {
      this.logger.error('Failed to get conversation thread:', error);
      throw new BadRequestException('Failed to retrieve conversation');
    }
  }

  async markAsRead(markReadDto: MarkReadDto): Promise<void> {
    const { messageId, userId } = markReadDto;

    try {
      await this.prisma.$transaction(async (prisma) => {
        // Check if message is already read
        const recipient = await prisma.smfPmRecipient.findUnique({
          where: {
            idPm_idMember: {
              idPm: messageId,
              idMember: userId
            }
          }
        });

        // Only update if message is unread
        if (recipient && recipient.isRead === 0) {
          await prisma.smfPmRecipient.update({
            where: {
              idPm_idMember: {
                idPm: messageId,
                idMember: userId
              }
            },
            data: {
              isRead: 1,
              isNew: 0
            }
          });

          // Update user's unread count (only if currently > 0)
          const user = await prisma.smfMember.findUnique({
            where: { idMember: userId },
            select: { unreadMessages: true }
          });

          if (user && user.unreadMessages > 0) {
            await prisma.smfMember.update({
              where: { idMember: userId },
              data: {
                unreadMessages: { decrement: 1 }
              }
            });
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to mark message as read:', error);
      throw new BadRequestException('Failed to mark message as read');
    }
  }

  async getUnreadCount(userId: number): Promise<number> {
    try {
      const user = await this.prisma.smfMember.findUnique({
        where: { idMember: userId },
        select: { unreadMessages: true }
      });

      return user?.unreadMessages || 0;
    } catch (error) {
      this.logger.error('Failed to get unread count:', error);
      throw new BadRequestException('Failed to get unread count');
    }
  }

  async searchMessages(searchDto: SearchMessagesDto): Promise<SmfMessage[]> {
    const { userId, searchTerm, limit = 20, offset = 0 } = searchDto;

    try {
      const messages = await this.prisma.smfPersonalMessage.findMany({
        where: {
          AND: [
            {
              OR: [
                { subject: { contains: searchTerm, mode: 'insensitive' } },
                { body: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            {
              OR: [
                {
                  idMemberFrom: userId,
                  deletedBySender: 0
                },
                {
                  recipients: {
                    some: {
                      idMember: userId,
                      deleted: 0
                    }
                  }
                }
              ]
            }
          ]
        },
        include: {
          sender: {
            select: {
              memberName: true
            }
          },
          recipients: {
            where: {
              idMember: userId
            }
          }
        },
        orderBy: {
          msgtime: 'desc'
        },
        skip: offset,
        take: limit
      });

      return messages.map(message => ({
        id: message.idPm,
        thread_id: message.idPmHead,
        sender_id: message.idMemberFrom,
        sender_name: message.fromName,
        subject: message.subject,
        message: this.encryptionService.decrypt(message.body), // Decrypt message body
        created_at: new Date(message.msgtime * 1000).toISOString(),
        timestamp: message.msgtime,
        is_read: message.recipients[0]?.isRead || 0,
        is_new: message.recipients[0]?.isNew || 0,
        type: message.idMemberFrom === userId ? 'sent' : 'received'
      }));
    } catch (error) {
      this.logger.error('Failed to search messages:', error);
      throw new BadRequestException('Failed to search messages');
    }
  }

  async deleteMessage(deleteMessageDto: DeleteMessageDto): Promise<void> {
    const { messageId, userId } = deleteMessageDto;

    try {
      await this.prisma.$transaction(async (prisma) => {
        // Get the message to check if user is sender
        const message = await prisma.smfPersonalMessage.findUnique({
          where: { idPm: messageId },
          select: { idMemberFrom: true }
        });

        if (!message) {
          throw new NotFoundException('Message not found');
        }

        const isSender = message.idMemberFrom === userId;

        if (isSender) {
          // User is the sender - mark message as deleted by sender
          await prisma.smfPersonalMessage.update({
            where: { idPm: messageId },
            data: { deletedBySender: 1 }
          });
        } else {
          // User is a recipient - mark as deleted for this specific recipient
          const recipient = await prisma.smfPmRecipient.findUnique({
            where: {
              idPm_idMember: {
                idPm: messageId,
                idMember: userId
              }
            }
          });

          if (!recipient) {
            throw new NotFoundException('You are not a recipient of this message');
          }

          await prisma.smfPmRecipient.update({
            where: {
              idPm_idMember: {
                idPm: messageId,
                idMember: userId
              }
            },
            data: { deleted: 1 }
          });

          // If message was unread, decrement unread count
          if (recipient.isRead === 0) {
            const user = await prisma.smfMember.findUnique({
              where: { idMember: userId },
              select: { unreadMessages: true }
            });

            if (user && user.unreadMessages > 0) {
              await prisma.smfMember.update({
                where: { idMember: userId },
                data: { unreadMessages: { decrement: 1 } }
              });
            }
          }
        }
      });

      this.logger.log(`Message ${messageId} deleted by user ${userId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to delete message:', error);
      throw new BadRequestException('Failed to delete message');
    }
  }

  async getUsers(searchTerm?: string, limit: number = 50): Promise<MessageUser[]> {
    try {
      const whereClause: any = {
        idMember: { gt: 0 }
      };

      if (searchTerm) {
        whereClause.OR = [
          { memberName: { contains: searchTerm, mode: 'insensitive' } },
          { realName: { contains: searchTerm, mode: 'insensitive' } }
        ];
      }

      const users = await this.prisma.smfMember.findMany({
        where: whereClause,
        select: {
          idMember: true,
          memberName: true,
          realName: true
        },
        orderBy: {
          memberName: 'asc'
        },
        take: limit
      });

      return users.map(user => ({
        id: user.idMember,
        username: user.memberName,
        displayName: user.realName || user.memberName
      }));
    } catch (error) {
      this.logger.error('Failed to get users:', error);
      throw new BadRequestException('Failed to retrieve users');
    }
  }

  /**
   * Bulk delete messages for a user
   */
  async bulkDeleteMessages(data: { messageIds: number[]; userId: number }): Promise<number> {
    const { messageIds, userId } = data;

    if (!messageIds || messageIds.length === 0) {
      return 0;
    }

    try {
      // Mark messages as deleted for this user
      const result = await this.prisma.smfPmRecipient.updateMany({
        where: {
          idPm: { in: messageIds },
          idMember: userId,
        },
        data: {
          deleted: 1,
        },
      });

      return result.count;
    } catch (error) {
      this.logger.error('Failed to bulk delete messages:', error);
      throw new BadRequestException('Failed to delete messages');
    }
  }

  /**
   * Bulk mark messages as important/unimportant
   */
  async bulkMarkImportant(data: {
    messageIds: number[];
    userId: number;
    isImportant: boolean;
  }): Promise<number> {
    const { messageIds, userId, isImportant } = data;

    if (!messageIds || messageIds.length === 0) {
      return 0;
    }

    try {
      const result = await this.prisma.smfPmRecipient.updateMany({
        where: {
          idPm: { in: messageIds },
          idMember: userId,
        },
        data: {
          isImportant: isImportant ? 1 : 0,
        },
      });

      return result.count;
    } catch (error) {
      this.logger.error('Failed to mark messages as important:', error);
      throw new BadRequestException('Failed to update message importance');
    }
  }
}