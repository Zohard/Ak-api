import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

import { FavoritesModule } from './favorites/favorites.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [FavoritesModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, PrismaService, CacheService],
  exports: [UsersService],
})
export class UsersModule { }
