import { Module } from '@nestjs/common';
import { JikanService } from './jikan.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  providers: [JikanService, CacheService],
  exports: [JikanService],
})
export class JikanModule { }
