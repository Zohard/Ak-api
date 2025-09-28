import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesDto, SearchMessagesDto, MarkReadDto } from './dto/get-messages.dto';
import { SmfMessage, MessageUser, MessageResponse, ConversationMessage } from './interfaces/message.interface';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(createMessageDto: CreateMessageDto): Promise<MessageResponse> {
    const { senderId, recipientId, subject, message, threadId } = createMessageDto;

    try {
      return await this.prisma.$transaction(async (prisma) => {
        // Get sender info
        const sender = await prisma.smfMember.findUnique({
          where: { idMember: senderId },
          select: { memberName: true, realName: true }
        });

        if (!sender) {
          throw new NotFoundException('Sender not found');
        }

        const senderName = sender.realName || sender.memberName;
        const msgTime = Math.floor(Date.now() / 1000);
        const pmHead = threadId || 0;

        // Insert message
        const newMessage = await prisma.smfPersonalMessage.create({
          data: {
            idPmHead: pmHead,
            idMemberFrom: senderId,
            fromName: senderName,
            msgtime: msgTime,
            subject,
            body: message
          }
        });

        const messageId = newMessage.idPm;

        // If this is the first message in a thread, update the pm_head
        if (!threadId) {
          await prisma.smfPersonalMessage.update({
            where: { idPm: messageId },
            data: { idPmHead: messageId }
          });
        }

        // Add recipient
        await prisma.smfPmRecipient.create({
          data: {
            idPm: messageId,
            idMember: recipientId,
            bcc: 0,
            isRead: 0,
            isNew: 1,
            deleted: 0,
            inInbox: 1
          }
        });

        // Update recipient's message counts
        await prisma.smfMember.update({
          where: { idMember: recipientId },
          data: {
            instantMessages: { increment: 1 },
            unreadMessages: { increment: 1 },
            newPm: 1
          }
        });

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
    const { userId, type, limit = 20, offset = 0 } = getMessagesDto;

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
    const messages = await this.prisma.smfPmRecipient.findMany({
      where: {
        idMember: userId,
        deleted: 0,
        inInbox: 1
      },
      include: {
        message: {
          include: {
            sender: {
              select: {
                memberName: true
              }
            }
          }
        }
      },
      orderBy: {
        message: {
          msgtime: 'desc'
        }
      },
      skip: offset,
      take: limit
    });

    return messages.map(recipient => ({
      id: recipient.message.idPm,
      thread_id: recipient.message.idPmHead,
      sender_id: recipient.message.idMemberFrom,
      sender_name: recipient.message.fromName,
      sender_username: recipient.message.sender.memberName,
      subject: recipient.message.subject,
      message: recipient.message.body,
      created_at: new Date(recipient.message.msgtime * 1000).toISOString(),
      timestamp: recipient.message.msgtime,
      is_read: recipient.isRead,
      is_new: recipient.isNew,
      bcc: recipient.bcc
    }));
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
      message: message.body,
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
        sender_username: message.sender.memberName,
        subject: message.subject,
        message: message.body,
        created_at: new Date(message.msgtime * 1000).toISOString(),
        is_read: message.recipients.find(r => r.idMember === userId)?.isRead || 0,
        recipient_id: message.recipients[0]?.idMember || 0,
        recipient_username: message.recipients[0]?.member.memberName || ''
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

        // Update user's unread count
        await prisma.smfMember.update({
          where: { idMember: userId },
          data: {
            unreadMessages: { decrement: 1 }
          }
        });
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
        message: message.body,
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
}