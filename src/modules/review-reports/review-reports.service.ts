import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateReviewReportDto } from './dto/create-review-report.dto';

@Injectable()
export class ReviewReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createReviewReportDto: CreateReviewReportDto, userId: number) {
    // Check if review exists
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: createReviewReportDto.id_critique },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Check if user already reported this review
    const existingReport = await this.prisma.akReviewReport.findFirst({
      where: {
        idCritique: createReviewReportDto.id_critique,
        idReporter: userId,
        status: 0, // Only check pending reports
      },
    });

    if (existingReport) {
      throw new BadRequestException('Vous avez déjà signalé cette critique');
    }

    // Create the report
    const report = await this.prisma.akReviewReport.create({
      data: {
        idCritique: createReviewReportDto.id_critique,
        idReporter: userId,
        reason: createReviewReportDto.reason,
        comment: createReviewReportDto.comment || null,
      },
    });

    return {
      success: true,
      message: 'Signalement envoyé avec succès. Notre équipe va l\'examiner.',
      data: {
        id_report: report.idReport,
      },
    };
  }

  async findAll(page: number = 1, limit: number = 20, status?: number) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status !== undefined) {
      where.status = status;
    }

    const [reports, total] = await Promise.all([
      this.prisma.akReviewReport.findMany({
        where,
        orderBy: {
          dateReport: 'desc',
        },
        skip,
        take: limit,
        include: {
          reporter: {
            select: {
              idMember: true,
              memberName: true,
              avatar: true,
            },
          },
          critique: {
            select: {
              idCritique: true,
              titre: true,
              niceUrl: true,
              idAnime: true,
              idManga: true,
              idJeu: true,
              membre: {
                select: {
                  memberName: true,
                },
              },
            },
          },
          moderator: {
            select: {
              idMember: true,
              memberName: true,
            },
          },
        },
      }),
      this.prisma.akReviewReport.count({ where }),
    ]);

    return {
      success: true,
      reports: reports.map((report) => ({
        id_report: report.idReport,
        id_critique: report.idCritique,
        review_title: report.critique.titre || 'Sans titre',
        review_nice_url: report.critique.niceUrl,
        review_author: report.critique.membre?.memberName || 'Utilisateur introuvable',
        reporter_id: report.reporter.idMember,
        reporter_name: report.reporter.memberName,
        reason: report.reason,
        comment: report.comment,
        status: report.status,
        date_report: report.dateReport,
        date_treated: report.dateTreated,
        moderator_name: report.moderator?.memberName,
        moderator_note: report.moderatorNote,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(reportId: number, status: number, userId: number, moderatorNote?: string) {
    const report = await this.prisma.akReviewReport.findUnique({
      where: { idReport: reportId },
    });

    if (!report) {
      throw new NotFoundException('Signalement introuvable');
    }

    if (report.status !== 0) {
      throw new BadRequestException('Ce signalement a déjà été traité');
    }

    await this.prisma.akReviewReport.update({
      where: { idReport: reportId },
      data: {
        status,
        idModerator: userId,
        dateTreated: new Date(),
        moderatorNote,
      },
    });

    return {
      success: true,
      message: status === 1 ? 'Signalement marqué comme traité' : 'Signalement rejeté',
    };
  }

  async getReviewReportsCount(reviewId: number) {
    const count = await this.prisma.akReviewReport.count({
      where: {
        idCritique: reviewId,
        status: 0, // Only pending reports
      },
    });

    return { count };
  }
}
