import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CollectionImportService } from '../services/collection-import.service';
import { EmailService } from '../../../shared/services/email.service';
import { PrismaService } from '../../../shared/services/prisma.service';
import { ImportMalItemDto } from '../dto/import-mal.dto';

export interface MalImportJobData {
    userId: number;
    userEmail: string;
    username: string;
    items: ImportMalItemDto[];
}

export interface MalImportResult {
    success: boolean;
    imported: number;
    failed: number;
    notFound: number;
    total: number;
    details: Array<{
        title: string;
        type: string;
        status: string;
        matchedId?: number;
        outcome: 'imported' | 'updated' | 'skipped' | 'not_found';
        reason?: string;
    }>;
}

@Processor('import-queue')
export class ImportProcessor extends WorkerHost {
    private readonly logger = new Logger(ImportProcessor.name);

    constructor(
        private readonly collectionImportService: CollectionImportService,
        private readonly emailService: EmailService,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job<MalImportJobData>): Promise<MalImportResult> {
        const { userId, userEmail, username, items } = job.data;

        this.logger.log(`Starting MAL import job ${job.id} for user ${userId} with ${items.length} items`);

        try {
            // Process items using CollectionImportService
            const result = await this.collectionImportService.importFromMAL(userId, items);

            this.logger.log(`MAL import job ${job.id} completed: ${result.imported} imported, ${result.failed} failed`);

            // Count not found items
            const notFound = result.details?.filter(d => d.outcome === 'not_found').length || 0;

            // Send email notification
            try {
                await this.emailService.sendImportSummaryEmail(
                    userEmail,
                    username,
                    {
                        imported: result.imported,
                        failed: result.failed,
                        notFound,
                        total: items.length,
                    }
                );
                this.logger.log(`Import summary email sent to ${userEmail}`);
            } catch (emailError) {
                this.logger.error(`Failed to send import summary email: ${emailError.message}`);
                // Don't fail the job if email fails
            }

            return {
                success: true,
                imported: result.imported,
                failed: result.failed,
                notFound,
                total: items.length,
                details: result.details || [],
            };
        } catch (error) {
            this.logger.error(`MAL import job ${job.id} failed: ${error.message}`);

            // Try to send failure email
            try {
                await this.emailService.sendImportFailureEmail(
                    userEmail,
                    username,
                    error.message || 'Unknown error'
                );
            } catch (emailError) {
                this.logger.error(`Failed to send import failure email: ${emailError.message}`);
            }

            throw error;
        }
    }
}
