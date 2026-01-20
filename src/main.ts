import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { setupSwagger } from './config/swagger.config';
import * as Sentry from '@sentry/nestjs';
import { Logger } from 'nestjs-pino';
import { DatabaseRetryInterceptor } from './common/interceptors/database-retry.interceptor';

async function bootstrap() {
  // Initialize Sentry for error tracking and performance monitoring
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
      // Performance Monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0, // Railway-friendly
      // Send default PII (IP address, user context)
      sendDefaultPii: true,
      // Add Railway context
      beforeSend(event) {
        if (event.request) {
          event.contexts = event.contexts || {};
          event.contexts.railway = {
            service: process.env.RAILWAY_SERVICE_NAME,
            environment: process.env.RAILWAY_ENVIRONMENT_NAME,
            deployment_id: process.env.RAILWAY_DEPLOYMENT_ID,
          };
        }
        return event;
      },
    });
    const logger = new NestLogger('Sentry');
    logger.log(`Sentry initialized for environment: ${process.env.NODE_ENV || 'development'}`);
  } else {
    console.warn('⚠️  SENTRY_DSN not configured - error tracking disabled');
    console.warn('   Add SENTRY_DSN to your .env file or Railway environment variables');
  }

  // Fix BigInt serialization globally
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until logger is ready
  });
  const configService = app.get(ConfigService);

  // Use Pino logger for structured logging (Railway-friendly)
  app.useLogger(app.get(Logger));

  // Global database retry interceptor for Neon cold start handling
  app.useGlobalInterceptors(new DatabaseRetryInterceptor());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Cookie parser for activity tracking
  app.use(cookieParser());

  // CORS configuration
  const corsOriginEnv = configService.get('CORS_ORIGIN') || '';
  const corsOrigins = [
    'http://localhost:3000', // Nuxt frontend dev
    'http://localhost:3001', // AI orchestrator dev
    'http://localhost:3003', // Frontend dev alternate port
    configService.get('FRONTEND_URL'), // Production frontend
    ...corsOriginEnv.split(',').map((o: string) => o.trim()), // Additional CORS origins (comma-separated)
    configService.get('AI_ORCHESTRATOR_URL'), // Production AI orchestrator
  ].filter(Boolean);

  // Log CORS origins for debugging
  const logger = new NestLogger('Bootstrap');
  logger.log(`CORS Origins: ${JSON.stringify(corsOrigins)}`);

  app.enableCors({
    origin: corsOrigins.length > 3 ? corsOrigins : true, // Fallback to allow all if env vars missing
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Current-Page',
      'X-Page-Path',
      'X-User-Id', // Add this for AI orchestrator
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // API prefix
  app.setGlobalPrefix('api');

  // Serve static uploads so /uploads/* works
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Setup Swagger documentation
  setupSwagger(app);

  const port = process.env.PORT || configService.get('PORT') || 3003;
  logger.log(`🔌 PORT from env: ${process.env.PORT}`);
  logger.log(`🔌 PORT from config: ${configService.get('PORT')}`);
  logger.log(`🔌 Using PORT: ${port}`);
  await app.listen(port, '0.0.0.0');

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  logger.log(
    `🚀 Anime-Kun NestJS API v3.0 running on http://localhost:${port}`,
  );
  logger.log(`📊 Health check at http://localhost:${port}/api`);
  logger.log(`📚 API documentation at http://localhost:${port}/docs`);
  logger.log(`💾 Database: PostgreSQL with Prisma`);
  logger.log(
    `🌍 Environment: ${configService.get('NODE_ENV') || 'development'}`,
  );
}

bootstrap();