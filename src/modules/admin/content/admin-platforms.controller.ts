import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { PrismaService } from '../../../shared/services/prisma.service';

@ApiTags('Admin - Platforms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/platforms')
export class AdminPlatformsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list() {
    const platforms = await this.prisma.akPlatform.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        idPlatform: true,
        name: true,
        manufacturer: true,
        generation: true,
        releaseYear: true,
        platformType: true,
        sortOrder: true,
      }
    });

    return { platforms };
  }
}
