import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { RateLimit, UserRateLimitGuard } from '../../common/guards/user-rate-limit.guard';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'Envoyer un message via le formulaire de contact' })
  @ApiResponse({ status: 201, description: 'Message envoyé avec succès' })
  @ApiResponse({ status: 429, description: 'Trop de requêtes' })
  @RateLimit({ windowMs: 3600000, max: 3 })
  @UseGuards(UserRateLimitGuard)
  async submitContact(@Body() dto: CreateContactDto) {
    await this.contactService.submitContact(dto);
    return { success: true, message: 'Message envoyé' };
  }
}
