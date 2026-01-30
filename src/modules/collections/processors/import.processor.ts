import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CollectionImportService } from '../services/collection-import.service';
import { EmailService } from '../../../shared/services/email.service';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
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

@Processor('import-queue', {
    // Reduce Redis polling to save Upstash requests
    drainDelay: 30000,        // Wait 30s between job checks when queue is empty (default: 5s)
    stalledInterval: 60000,   // Check for stalled jobs every 60s (default: 30s)
    lockDuration: 60000,      // Lock jobs for 60s (default: 30s)
})
export class ImportProcessor extends WorkerHost {
    private readonly logger = new Logger(ImportProcessor.name);

    constructor(
        private readonly collectionImportService: CollectionImportService,
        private readonly emailService: EmailService,
        private readonly prisma: PrismaService,
        private readonly cacheService: CacheService,
    ) {
        super();
    }

    // Check if email was already sent for this job
    private async wasEmailSent(jobId: string): Promise<boolean> {
        const key = `import_email_sent:${jobId}`;
        const sent = await this.cacheService.get<boolean>(key);
        return sent === true;
    }

    // Mark email as sent for this job (expires in 24h)
    private async markEmailSent(jobId: string): Promise<void> {
        const key = `import_email_sent:${jobId}`;
        await this.cacheService.set(key, true, 86400); // 24 hours
    }

    async process(job: Job<MalImportJobData>): Promise<MalImportResult> {
        const { userId, userEmail, username, items } = job.data;
        const attemptNumber = job.attemptsMade + 1;

        this.logger.log(`Starting MAL import job ${job.id} for user ${userId} with ${items.length} items (attempt ${attemptNumber})`);

        try {
            // Process items using CollectionImportService with progress reporting
            const result = await this.collectionImportService.importFromMAL(
                userId,
                items,
                async (processed, total) => {
                    const percentage = Math.round((processed / total) * 100);
                    await job.updateProgress({ processed, total, percentage });
                }
            );

            this.logger.log(`MAL import job ${job.id} completed: ${result.imported} imported, ${result.failed} failed`);

            // Count not found items
            const notFound = result.details?.filter(d => d.outcome === 'not_found').length || 0;

            const jobResult: MalImportResult = {
                success: true,
                imported: result.imported,
                failed: result.failed,
                notFound,
                total: items.length,
                details: result.details || [],
            };

            // Get list of failed items for the email
            const failedItems = (result.details || [])
                .filter(d => d.outcome === 'not_found' || d.outcome === 'skipped')
                .map(d => ({ title: d.title, reason: d.reason || (d.outcome === 'not_found' ? 'Non trouvé' : 'Erreur') }));

            // Check if email was already sent for this job (prevents duplicates on retries)
            const emailAlreadySent = await this.wasEmailSent(job.id);
            if (!emailAlreadySent) {
                try {
                    await this.emailService.sendImportSummaryEmail(
                        userEmail,
                        username,
                        {
                            imported: result.imported,
                            failed: result.failed,
                            notFound,
                            total: items.length,
                            failedItems,
                        }
                    );
                    await this.markEmailSent(job.id);
                    this.logger.log(`Import summary email sent to ${userEmail}`);
                } catch (emailError) {
                    this.logger.error(`Failed to send import summary email: ${emailError.message}`);
                    // Don't fail the job if email fails
                }
            } else {
                this.logger.log(`Email already sent for job ${job.id}, skipping`);
            }

            return jobResult;
        } catch (error) {
            this.logger.error(`MAL import job ${job.id} failed (attempt ${attemptNumber}): ${error.message}`);

            // Only send failure email on final attempt and if not already sent
            const maxAttempts = (job.opts?.attempts || 3);
            const emailAlreadySent = await this.wasEmailSent(job.id);
            if (attemptNumber >= maxAttempts && !emailAlreadySent) {
                try {
                    await this.emailService.sendImportFailureEmail(
                        userEmail,
                        username,
                        error.message || 'Unknown error'
                    );
                    await this.markEmailSent(job.id);
                    this.logger.log(`Import failure email sent to ${userEmail} (final attempt)`);
                } catch (emailError) {
                    this.logger.error(`Failed to send import failure email: ${emailError.message}`);
                }
            }

            throw error;
        }
    }
}
