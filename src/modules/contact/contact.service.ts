import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../shared/services/email.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) { }

  async submitContact(dto: CreateContactDto): Promise<void> {
    this.logger.log(`Contact form submission from ${dto.email}`);

    // Save to DB first
    await this.prisma.akContactMessage.create({
      data: {
        name: dto.name,
        email: dto.email,
        message: dto.message,
      },
    });

    // Send email (don't let email failure prevent storage)
    try {
      await this.emailService.sendContactEmail(dto.name, dto.email, dto.message);
    } catch (error) {
      this.logger.error(`Failed to send contact email: ${error.message}`);
    }
  }

  async countUnread(): Promise<number> {
    return this.prisma.akContactMessage.count({
      where: { isRead: false },
    });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.akContactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.akContactMessage.count(),
    ]);

    return {
      data: data.map((m) => ({
        id: m.idContact,
        name: m.name,
        email: m.email,
        message: m.message,
        isRead: m.isRead,
        createdAt: m.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async markAsRead(id: number) {
    await this.prisma.akContactMessage.update({
      where: { idContact: id },
      data: { isRead: true },
    });
    return { success: true };
  }

  async sendReply(id: number, response: string) {
    // Get the contact message
    const message = await this.prisma.akContactMessage.findUnique({
      where: { idContact: id },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Send email reply to the user
    try {
      await this.emailService.sendContactReply(
        message.name,
        message.email,
        message.message,
        response,
      );

      // Mark as read
      await this.prisma.akContactMessage.update({
        where: { idContact: id },
        data: { isRead: true },
      });

      this.logger.log(`Reply sent to ${message.email} for contact message ${id}`);
      return { success: true, message: 'Reply sent successfully' };
    } catch (error) {
      this.logger.error(`Failed to send reply: ${error.message}`);
      throw new Error('Failed to send reply email');
    }
  }

  async remove(id: number) {
    await this.prisma.akContactMessage.delete({
      where: { idContact: id },
    });
    return { success: true };
  }
}
