import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AniListService } from './anilist.service';
import { JikanModule } from '../jikan/jikan.module';

@Module({
  imports: [ConfigModule, JikanModule],
  providers: [AniListService],
  exports: [AniListService],
})
export class AniListModule {}