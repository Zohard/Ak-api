import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AdminGuard } from '../src/common/guards/admin.guard';

describe('Media E2E', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  const mockJwtGuard = {
    canActivate: jest.fn(() => true),
  };

  const mockAdminGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(AdminGuard)
      .useValue(mockAdminGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/media (POST)', () => {
    it('should upload image successfully', () => {
      const mockImageBuffer = Buffer.from('fake-image-data');

      return request(app.getHttpServer())
        .post('/api/media/upload')
        .attach('file', mockImageBuffer, 'test.jpg')
        .field('type', 'anime')
        .field('relatedId', '123')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('url');
          expect(res.body.type).toBe('anime');
          expect(res.body.relatedId).toBe(123);
        });
    });

    it('should reject invalid file type', () => {
      const mockTextFile = Buffer.from('text content');

      return request(app.getHttpServer())
        .post('/api/media/upload')
        .attach('file', mockTextFile, 'test.txt')
        .field('type', 'anime')
        .expect(400);
    });

    it('should require authentication', () => {
      mockJwtGuard.canActivate.mockReturnValueOnce(false);

      return request(app.getHttpServer()).post('/api/media/upload').expect(401);
    });
  });

  describe('/api/media/:id (GET)', () => {
    it('should get media by id', () => {
      // Mock database response
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
        {
          id: 1,
          filename: 'test.webp',
          original_name: 'test.jpg',
          file_size: 1000,
          mime_type: 'image/webp',
          type: 'anime',
          related_id: 123,
          upload_path: '/uploads/test.webp',
          created_at: new Date(),
        },
      ]);

      return request(app.getHttpServer())
        .get('/api/media/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', 1);
          expect(res.body).toHaveProperty('filename', 'test.webp');
          expect(res.body).toHaveProperty('type', 'anime');
        });
    });

    it('should return 404 for non-existent media', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);

      return request(app.getHttpServer()).get('/api/media/999').expect(404);
    });
  });

  describe('/api/media/content/:relatedId (GET)', () => {
    it('should get media by related content', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
        {
          id: 1,
          filename: 'test1.webp',
          original_name: 'test1.jpg',
          file_size: 1000,
          mime_type: 'image/webp',
          type: 'anime',
          related_id: 123,
          upload_path: '/uploads/test1.webp',
          created_at: new Date(),
        },
        {
          id: 2,
          filename: 'test2.webp',
          original_name: 'test2.jpg',
          file_size: 2000,
          mime_type: 'image/webp',
          type: 'anime',
          related_id: 123,
          upload_path: '/uploads/test2.webp',
          created_at: new Date(),
        },
      ]);

      return request(app.getHttpServer())
        .get('/api/media/content/123')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(2);
          expect(res.body[0]).toHaveProperty('relatedId', 123);
          expect(res.body[1]).toHaveProperty('relatedId', 123);
        });
    });
  });

  describe('/api/media/:id (DELETE)', () => {
    it('should delete media successfully', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
        {
          id: 1,
          upload_path: '/uploads/test.webp',
        },
      ]);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .delete('/api/media/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
        });
    });

    it('should return 404 for non-existent media', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);

      return request(app.getHttpServer()).delete('/api/media/999').expect(404);
    });
  });

  describe('/api/media/admin/stats (GET)', () => {
    it('should get admin statistics', () => {
      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValueOnce([
          {
            total_files: 100,
            total_size: 50000000,
            avg_size: 500000,
          },
        ])
        .mockResolvedValueOnce([
          { type: 'anime', count: 60 },
          { type: 'manga', count: 30 },
          { type: 'avatar', count: 10 },
        ]);

      return request(app.getHttpServer())
        .get('/api/media/admin/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalFiles', 100);
          expect(res.body).toHaveProperty('totalSize', 50000000);
          expect(res.body).toHaveProperty('typeBreakdown');
          expect(res.body.typeBreakdown).toHaveProperty('anime', 60);
        });
    });

    it('should require admin access', () => {
      mockAdminGuard.canActivate.mockReturnValueOnce(false);

      return request(app.getHttpServer())
        .get('/api/media/admin/stats')
        .expect(403);
    });
  });

  describe('/api/media/admin/bulk-upload (POST)', () => {
    it('should handle bulk upload', () => {
      const mockFiles = [
        Buffer.from('fake-image-1'),
        Buffer.from('fake-image-2'),
      ];

      return request(app.getHttpServer())
        .post('/api/media/admin/bulk-upload')
        .attach('files', mockFiles[0], 'test1.jpg')
        .attach('files', mockFiles[1], 'test2.jpg')
        .field('type', 'anime')
        .field('relatedId', '123')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('results');
          expect(res.body).toHaveProperty('successCount');
          expect(res.body).toHaveProperty('errorCount');
        });
    });

    it('should require admin access', () => {
      mockAdminGuard.canActivate.mockReturnValueOnce(false);

      return request(app.getHttpServer())
        .post('/api/media/admin/bulk-upload')
        .expect(403);
    });
  });
});
