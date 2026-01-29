// IMPORTANT: Import instrument.ts first to initialize Sentry before anything else
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { setupSwagger } from './config/swagger.config';
import { Logger } from 'nestjs-pino';
import { DatabaseRetryInterceptor } from './common/interceptors/database-retry.interceptor';
import { json } from 'express';

async function bootstrap() {
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

  // Security headers middleware
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // XSS Protection (legacy, but still useful)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions policy (restrict sensitive APIs)
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=()',
    );
    // HSTS (only in production with HTTPS)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });

  // Increase body size limit for large imports (e.g., MAL XML imports)
  app.use(json({ limit: '50mb' }));

  // CORS configuration
  const corsOriginEnv = configService.get('CORS_ORIGIN') || '';
  const nodeEnv = configService.get('NODE_ENV') || 'development';
  const corsOrigins = [
    'http://localhost:3000', // Nuxt frontend dev
    'http://localhost:3001', // AI orchestrator dev
    'http://localhost:3003', // Frontend dev alternate port
    configService.get('FRONTEND_URL'), // Production frontend
    ...corsOriginEnv.split(',').map((o: string) => o.trim()).filter(Boolean), // Additional CORS origins (comma-separated)
    configService.get('AI_ORCHESTRATOR_URL'), // Production AI orchestrator
  ].filter(Boolean);

  const logger = new NestLogger('Bootstrap');

  // In production, require explicit CORS origins. In development, allow localhost origins.
  const isProduction = nodeEnv === 'production';
  const hasProductionOrigins = corsOrigins.some(
    (origin) => origin && !origin.includes('localhost'),
  );

  if (isProduction && !hasProductionOrigins) {
    logger.warn(
      'SECURITY WARNING: No production CORS origins configured. Set FRONTEND_URL or CORS_ORIGIN environment variables.',
    );
  }

  logger.log(`Configured CORS origins for reference: ${JSON.stringify(corsOrigins)}`);

  app.enableCors({
    // Relaxed CORS: Allow any origin (reflects request origin)
    // This resolves issues where specific origins might be blocked or headers missing
    origin: true,
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

  logger.log(`API running on port ${port} (${configService.get('NODE_ENV') || 'development'})`);
}

bootstrap();