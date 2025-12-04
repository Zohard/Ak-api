import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get(':userId')
  async getRecommendations(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;

    if (parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const mediaType = type === 'anime' || type === 'manga' ? type : undefined;

    return this.recommendationsService.getRecommendationsForUser(
      userId,
      parsedLimit,
      mediaType,
    );
  }
}
