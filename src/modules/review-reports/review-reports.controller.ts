import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ReviewReportsService } from './review-reports.service';
import { CreateReviewReportDto } from './dto/create-review-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Review Reports')
@Controller('review-reports')
export class ReviewReportsController {
  constructor(private readonly reviewReportsService: ReviewReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Signaler une critique' })
  @ApiResponse({
    status: 201,
    description: 'Signalement envoyé avec succès',
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides ou critique déjà signalée',
  })
  @ApiResponse({
    status: 404,
    description: 'Critique introuvable',
  })
  async create(@Body() createReviewReportDto: CreateReviewReportDto, @Request() req) {
    return this.reviewReportsService.create(createReviewReportDto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir tous les signalements (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des signalements',
  })
  async findAll(
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('status') statusStr?: string,
  ) {
    const page = pageStr ? parseInt(pageStr) : 1;
    const limit = limitStr ? parseInt(limitStr) : 20;
    const status = statusStr !== undefined ? parseInt(statusStr) : undefined;
    return this.reviewReportsService.findAll(page, limit, status);
  }

  @Get('review/:id/count')
  @ApiOperation({ summary: 'Obtenir le nombre de signalements pour une critique' })
  @ApiParam({ name: 'id', description: 'ID de la critique', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Nombre de signalements en attente',
  })
  async getReviewReportsCount(@Param('id', ParseIntPipe) id: number) {
    return this.reviewReportsService.getReviewReportsCount(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marquer un signalement comme traité (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID du signalement', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Signalement traité',
  })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body('moderator_note') moderatorNote: string | undefined,
    @Request() req,
  ) {
    return this.reviewReportsService.updateStatus(id, 1, req.user.id, moderatorNote);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rejeter un signalement (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID du signalement', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Signalement rejeté',
  })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('moderator_note') moderatorNote: string | undefined,
    @Request() req,
  ) {
    return this.reviewReportsService.updateStatus(id, 2, req.user.id, moderatorNote);
  }
}
