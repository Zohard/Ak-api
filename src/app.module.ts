import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AnimesModule } from './modules/animes/animes.module';
import { MangasModule } from './modules/mangas/mangas.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SearchModule } from './modules/search/search.module';
import { BusinessModule } from './modules/business/business.module';
import { AdminModule } from './modules/admin/admin.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { SeasonsModule } from './modules/seasons/seasons.module';
import { ForumsModule } from './modules/forums/forums.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { ListsModule } from './modules/lists/lists.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HomePageModule } from './modules/homepage/homepage.module';
import { ScrapeModule } from './modules/scrape/scrape.module';
import { FriendsModule } from './modules/friends/friends.module';
import { LegacyModule } from './modules/legacy/legacy.module';
import { SynopsisModule } from './modules/synopsis/synopsis.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MessagesModule } from './modules/messages/messages.module';
import { PrismaService } from './shared/services/prisma.service';
import { CacheService } from './shared/services/cache.service';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
      envFilePath: '.env',
    }),
    AuthModule,
    UsersModule,
    AnimesModule,
    MangasModule,
    ReviewsModule,
    SearchModule,
    BusinessModule,
    AdminModule,
    MediaModule,
    NotificationsModule,
    ArticlesModule,
    SeasonsModule,
    ForumsModule,
    CollectionsModule,
    ListsModule,
    JobsModule,
    GatewayModule,
    HomePageModule,
    FriendsModule,
    SynopsisModule,
    ScrapeModule,
    LegacyModule,
    MetricsModule,
    MessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService, CacheService],
})
export class AppModule {}
