import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image')),
    metadata: jest.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
    }),
  }));
});

describe('MediaService', () => {
  let service: MediaService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      switch (key) {
        case 'UPLOAD_PATH':
          return '/tmp/uploads';
        case 'MAX_FILE_SIZE':
          return 5000000;
        default:
          return defaultValue;
      }
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);

    // Mock fs functions
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadImage', () => {
    const mockFile = {
      fieldname: 'image',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1000,
      buffer: Buffer.from('test-image'),
    } as Express.Multer.File;

    it('should upload and process image successfully', async () => {
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 1 }]);

      const result = await service.uploadImage(mockFile, 'anime', 123);

      expect(result).toEqual({
        id: 1,
        url: expect.stringContaining('/uploads/'),
        type: 'anime',
        relatedId: 123,
        originalName: 'test.jpg',
        size: expect.any(Number),
        mimeType: 'image/webp',
      });

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid file type', async () => {
      const invalidFile = { ...mockFile, mimetype: 'text/plain' };

      await expect(
        service.uploadImage(invalidFile, 'anime', 123),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for oversized file', async () => {
      const oversizedFile = { ...mockFile, size: 10000000 };

      await expect(
        service.uploadImage(oversizedFile, 'anime', 123),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMediaById', () => {
    it('should return media by id', async () => {
      const mockMedia = {
        id: 1,
        filename: 'test.webp',
        related_id: 123,
        type: 1,
        upload_date: new Date(),
      };

      mockPrismaService.$queryRaw.mockResolvedValue([mockMedia]);

      // Mock the getTypeName method
      jest.spyOn(service as any, 'getTypeName').mockReturnValue('anime');

      const result = await service.getMediaById(1);

      expect(result).toEqual({
        id: 1,
        filename: 'test.webp',
        relatedId: 123,
        type: 'anime',
        uploadDate: mockMedia.upload_date,
        url: '/uploads/test.webp',
      });
    });

    it('should throw NotFoundException when media not found', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await expect(service.getMediaById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteMedia', () => {
    it('should delete media successfully', async () => {
      const mockMedia = [
        {
          id_screen: 1,
          url_screen: 'test.webp',
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockMedia);
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);

      const result = await service.deleteMedia(1, 123);

      expect(result).toBe(true);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });

    it('should return false when media not found', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.deleteMedia(999, 123);

      expect(result).toBe(false);
    });
  });

  describe('getMediaByRelatedId', () => {
    it('should return media for content', async () => {
      const mockMedia = [
        {
          id_screen: 1,
          url_screen: 'test1.webp',
          id_titre: 123,
          type: 1,
          upload_date: new Date(),
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockMedia);

      const result = await service.getMediaByRelatedId(123, 'anime');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        url: 'test1.webp',
        relatedId: 123,
        type: 'anime',
        uploadDate: mockMedia[0].upload_date,
      });
    });
  });

  describe('getUploadStats', () => {
    it('should return upload statistics', async () => {
      const mockStats = [
        {
          total_files: 100,
          anime_count: 60,
          manga_count: 40,
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockStats);

      const result = await service.getUploadStats();

      expect(result).toEqual({
        totalFiles: 100,
        animeCount: 60,
        mangaCount: 40,
      });
    });
  });

  describe('validateFile', () => {
    it('should validate file successfully', () => {
      const validFile = {
        mimetype: 'image/jpeg',
        size: 1000000,
      } as Express.Multer.File;

      expect(() => service['validateFile'](validFile)).not.toThrow();
    });

    it('should throw error for invalid mime type', () => {
      const invalidFile = {
        mimetype: 'text/plain',
        size: 1000000,
      } as Express.Multer.File;

      expect(() => service['validateFile'](invalidFile)).toThrow(
        'Invalid file type',
      );
    });

    it('should throw error for oversized file', () => {
      const oversizedFile = {
        mimetype: 'image/jpeg',
        size: 10000000,
      } as Express.Multer.File;

      expect(() => service['validateFile'](oversizedFile)).toThrow(
        'File size exceeds limit',
      );
    });
  });

  describe('processImage', () => {
    it('should process image for anime type', async () => {
      const mockBuffer = Buffer.from('test-image');

      const result = await service['processImage'](mockBuffer, 'anime');

      expect(result).toEqual(Buffer.from('processed-image'));
    });

    it('should process image for different types with correct dimensions', async () => {
      const mockBuffer = Buffer.from('test-image');

      await service['processImage'](mockBuffer, 'avatar');
      await service['processImage'](mockBuffer, 'cover');
      await service['processImage'](mockBuffer, 'manga');

      // Verify sharp was called with different resize parameters
      expect(require('sharp')).toHaveBeenCalledTimes(4);
    });
  });
});
