import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { GatewayMiddleware } from './middleware/gateway.middleware';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
  ],
  controllers: [GatewayController],
  providers: [GatewayService, RateLimitGuard, GatewayMiddleware],
  exports: [GatewayService],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(GatewayMiddleware)
      .forRoutes('gateway/*');
  }
}