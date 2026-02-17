import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GatewayMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';

    res.on('finish', () => {
      const { statusCode } = res;
      if (statusCode >= 500) {
        const responseTime = Date.now() - startTime;
        this.logger.warn(
          `${method} ${originalUrl} ${statusCode} - ${responseTime}ms from ${ip}`,
        );
      }
    });

    res.setHeader('X-Gateway-Timestamp', new Date().toISOString());
    res.setHeader('X-Gateway-Request-ID', `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    next();
  }
}