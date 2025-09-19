import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { MediaModule } from '../media/media.module';
import { AniListModule } from '../anilist/anilist.module';

@Module({
  imports: [MediaModule, AniListModule],
  controllers: [BusinessController],
  providers: [BusinessService, PrismaService],
  exports: [BusinessService],
})
export class BusinessModule {}
