import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as express from 'express';
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
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: [
      'http://localhost:3000', // Frontend dev
      'http://localhost:3001', // Frontend prod  
      'http://localhost:3004', // Frontend dev alternate port
      configService.get('FRONTEND_URL'),
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
  });

  // API prefix
  app.setGlobalPrefix('api');

  // Serve static uploads so /uploads/* works
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Setup Swagger documentation
  setupSwagger(app);

  const port = configService.get('PORT') || 3004;
  await app.listen(port, '0.0.0.0');

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
