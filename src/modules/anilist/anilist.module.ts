import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AniListService } from './anilist.service';

@Module({
  imports: [ConfigModule],
  providers: [AniListService],
  exports: [AniListService],
})
export class AniListModule {}