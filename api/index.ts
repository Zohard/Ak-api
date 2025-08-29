import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/config/swagger.config';
import { VercelRequest, VercelResponse } from '@vercel/node';

let app: any;

const initializeApp = async () => {
  if (!app) {
    // Fix BigInt serialization globally
    (BigInt.prototype as any).toJSON = function () {
      return Number(this);
    };

    app = await NestFactory.create(AppModule);
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
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3004',
        configService.get('FRONTEND_URL'),
        /\.vercel\.app$/,
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

    // Setup Swagger documentation
    setupSwagger(app);

    await app.init();
  }
  return app;
};

export default async (req: VercelRequest, res: VercelResponse) => {
  const nestApp = await initializeApp();
  const adapter = nestApp.getHttpAdapter();
  const instance = adapter.getInstance();
  return instance(req, res);
};