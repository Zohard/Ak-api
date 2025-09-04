import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HomePageService } from './homepage.service';

@ApiTags('Homepage')
@Controller('homepage')
export class HomePageController {
  private readonly logger = new Logger(HomePageController.name);

  constructor(private readonly homePageService: HomePageService) {}

  @Get()
  @ApiOperation({ summary: 'Aggregated data for homepage' })
  @ApiResponse({ status: 200, description: 'Homepage aggregated payload' })
  async getHomePageData() {
    return this.homePageService.getHomePageData();
  }
}

