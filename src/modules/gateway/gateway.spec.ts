import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { RateLimitGuard } from './guards/rate-limit.guard';

describe('GatewayModule', () => {
  let controller: GatewayController;
  let service: GatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      controllers: [GatewayController],
      providers: [GatewayService, RateLimitGuard],
    }).compile();

    controller = module.get<GatewayController>(GatewayController);
    service = module.get<GatewayService>(GatewayService);
  });

  describe('GatewayService', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with default routes', () => {
      const routes = service.getAllRoutes();
      expect(routes).toBeDefined();
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should find auth route', () => {
      const route = service.findRoute('POST', '/auth/login');
      expect(route).toBeDefined();
      expect(route?.target).toBe('auth');
      expect(route?.rateLimit).toBeDefined();
    });

    it('should find wildcard routes', () => {
      const route = service.findRoute('GET', '/animes/popular');
      expect(route).toBeDefined();
      expect(route?.target).toBe('animes');
    });

    it('should return null for unknown routes', () => {
      const route = service.findRoute('GET', '/unknown/route');
      expect(route).toBeNull();
    });

    it('should add custom routes', () => {
      const customRoute = {
        path: '/custom/*',
        method: 'GET',
        target: 'custom-service',
        rateLimit: { windowMs: 60000, max: 10 },
      };

      service.addRoute(customRoute);
      const foundRoute = service.findRoute('GET', '/custom/test');
      expect(foundRoute).toBeDefined();
      expect(foundRoute?.target).toBe('custom-service');
    });
  });

  describe('GatewayController', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should return health status', () => {
      const health = controller.getHealth();
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.routes).toBeGreaterThan(0);
    });
  });
});