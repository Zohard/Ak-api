import { Controller, Post, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImageKitService } from './imagekit.service';

@Controller('api/imagekit')
export class ImageKitController {
  constructor(private readonly imageKitService: ImageKitService) {}

  @Get('auth')
  getAuthenticationParameters() {
    return this.imageKitService.getAuthenticationParameters();
  }

  @Get('config')
  getConfig() {
    return this.imageKitService.getPublicConfig();
  }
}