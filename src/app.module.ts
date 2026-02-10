import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AnimesModule } from './modules/animes/animes.module';
import { MangasModule } from './modules/mangas/mangas.module';
import { JeuxVideoModule } from './modules/jeux-video/jeux-video.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SearchModule } from './modules/search/search.module';
import { BusinessModule } from './modules/business/business.module';
import { AdminModule } from './modules/admin/admin.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { ArticleRelationsModule } from './modules/article-relations/article-relations.module';
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
import { BooksModule } from './modules/books/books.module';
import { EventsModule } from './modules/events/events.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { HealthModule } from './modules/health/health.module';
import { ReviewReportsModule } from './modules/review-reports/review-reports.module';
import { IgdbModule } from './modules/igdb/igdb.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { ToolsModule } from './modules/admin/tools/tools.module';
import { CronModule } from './modules/cron/cron.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { ContactModule } from './modules/contact/contact.module';
import { PrismaService } from './shared/services/prisma.service';
import { CacheService } from './shared/services/cache.service';
import { ActivityTrackerService } from './shared/services/activity-tracker.service';
import { DatabaseWarmupService } from './shared/services/database-warmup.service';
import { ActivityTrackerMiddleware } from './common/middleware/activity-tracker.middleware';
import { CacheControlMiddleware } from './common/middleware/cache-control.middleware';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig],
      envFilePath: '.env',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Disable auto-logging of requests in production to avoid rate limits
        autoLogging: process.env.NODE_ENV !== 'production',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
            : undefined, // Use JSON logs in production (Railway-friendly)
        redact: ['req.headers.authorization'], // Don't log sensitive data
        customProps: () => ({
          railway: {
            service: process.env.RAILWAY_SERVICE_NAME,
            environment: process.env.RAILWAY_ENVIRONMENT_NAME,
          },
        }),
      },
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') || configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn') || '7d',
        },
      }),
    }),
    // BullMQ for background job processing
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isUpstash = configService.get<boolean>('redis.isUpstash');
        console.log(`🔧 BullMQ config: isUpstash=${isUpstash}`);

        return {
          connection: {
            host: configService.get<string>('redis.host'),
            port: configService.get<number>('redis.port'),
            password: configService.get<string>('redis.password'),
            tls: configService.get<any>('redis.tls'),
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false,
            enableOfflineQueue: false,
            connectTimeout: 30000,
            // Upstash needs shorter keepalive to avoid connection drops
            keepAlive: isUpstash ? 10000 : 30000,
            retryStrategy: (times) => {
              const delay = Math.min(times * 1000, 30000);
              console.log(`BullMQ Redis retry attempt ${times}, waiting ${delay}ms`);
              return delay;
            }
          },
          prefix: 'bull',
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        };
      },
    }),
    // Global rate limiting: 200 requests per second per IP (User request)
    ThrottlerModule.forRoot([
      {
        ttl: 1000,
        limit: 2000,
      },
    ]),
    SentryModule.forRoot(),
    AuthModule,
    UsersModule,
    AnimesModule,
    MangasModule,
    JeuxVideoModule,
    ReviewsModule,
    SearchModule,
    BusinessModule,
    AdminModule,
    RbacModule,
    ToolsModule,
    MediaModule,
    NotificationsModule,
    ArticlesModule,
    ArticleRelationsModule,
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
    BooksModule,
    EventsModule,
    RecommendationsModule,
    HealthModule,
    ReviewReportsModule,
    IgdbModule,
    CronModule,
    SystemSettingsModule,
    ContactModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    CacheService,
    ActivityTrackerService,
    DatabaseWarmupService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CacheControlMiddleware)
      .forRoutes('*');
    consumer
      .apply(ActivityTrackerMiddleware)
      .forRoutes('*');
  }
}
