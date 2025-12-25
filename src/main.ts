import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  // Fix BigInt serialization globally
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

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
  app.enableCors({
    origin: [
      'http://localhost:3000', // Nuxt frontend dev
      'http://localhost:3001', // AI orchestrator dev
      'http://localhost:3003', // Frontend dev alternate port
      configService.get('FRONTEND_URL'), // Production frontend
      configService.get('CORS_ORIGIN'), // Additional CORS origins
      configService.get('AI_ORCHESTRATOR_URL'), // Production AI orchestrator
    ].filter(Boolean),
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
  });

  // API prefix
  app.setGlobalPrefix('api');

  // Serve static uploads so /uploads/* works
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Setup Swagger documentation
  setupSwagger(app);

  const port = process.env.PORT || configService.get('PORT') || 3003;
  console.log(`🔌 PORT from env: ${process.env.PORT}`);
  console.log(`🔌 PORT from config: ${configService.get('PORT')}`);
  console.log(`🔌 Using PORT: ${port}`);
  await app.listen(port, '0.0.0.0');

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  console.log(
    `🚀 Anime-Kun NestJS API v3.0 running on http://localhost:${port}`,
  );
  console.log(`📊 Health check at http://localhost:${port}/api`);
  console.log(`📚 API documentation at http://localhost:${port}/docs`);
  console.log(`💾 Database: PostgreSQL with Prisma`);
  console.log(
    `🌍 Environment: ${configService.get('NODE_ENV') || 'development'}`,
  );
}

bootstrap();