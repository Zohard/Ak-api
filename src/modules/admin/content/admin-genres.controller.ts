import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { PrismaService } from '../../../shared/services/prisma.service';

@ApiTags('Admin - Genres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/genres')
export class AdminGenresController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list() {
    const genres = await this.prisma.akGenre.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        idGenre: true,
        name: true,
        nameFr: true,
        slug: true,
        sortOrder: true,
      }
    });

    return { genres };
  }
}
