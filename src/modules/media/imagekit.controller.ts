import { Controller, Post, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImageKitService } from './imagekit.service';

@Controller('imagekit')
export class ImageKitController {
  constructor(private readonly imageKitService: ImageKitService) {}

  @Post('auth')
  @UseGuards(JwtAuthGuard)
  getAuthenticationParameters(@Request() req) {
    // Only allow admin users to upload images
    if (!req.user.isAdmin) {
      throw new Error('Unauthorized: Admin access required');
    }
    
    return this.imageKitService.getAuthenticationParameters();
  }

  @Get('config')
  getConfig() {
    return this.imageKitService.getPublicConfig();
  }
}