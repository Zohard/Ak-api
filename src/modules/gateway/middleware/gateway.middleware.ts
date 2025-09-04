import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GatewayMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';

    this.logger.log(`Gateway Request: ${method} ${originalUrl} from ${ip}`);

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length') || '0';
      const responseTime = Date.now() - startTime;

      this.logger.log(
        `Gateway Response: ${method} ${originalUrl} ${statusCode} ${contentLength}b - ${responseTime}ms`,
      );

      if (statusCode >= 400) {
        this.logger.warn(
          `Gateway Error Response: ${statusCode} for ${method} ${originalUrl}`,
        );
      }
    });

    res.setHeader('X-Gateway-Timestamp', new Date().toISOString());
    res.setHeader('X-Gateway-Request-ID', `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    next();
  }
}