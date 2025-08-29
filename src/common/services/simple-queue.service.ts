import { Injectable } from '@nestjs/common';

// Simplified queue service without external dependencies
@Injectable()
export class SimpleQueueService {
  private jobs: Map<string, any> = new Map();

  async addReviewModerationJob(
    reviewId: number,
    userId: number,
    contentId: number,
    contentType: string,
  ) {
    const jobId = `review_${reviewId}_${Date.now()}`;
    console.log(`Adding review moderation job for review ${reviewId}`);

    // In a real implementation, this would trigger background processing
    this.jobs.set(jobId, {
      id: jobId,
      type: 'review_moderation',
      payload: { reviewId, userId, contentId, contentType },
      status: 'queued',
      created_at: new Date(),
    });

    return { id: jobId, status: 'queued' };
  }

  async addContentReportJob(
    reportId: number,
    contentType: string,
    contentId: number,
    reason: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ) {
    const jobId = `report_${reportId}_${Date.now()}`;
    console.log(`Adding content report job for ${contentType} ${contentId}`);

    this.jobs.set(jobId, {
      id: jobId,
      type: 'content_report',
      payload: { reportId, contentType, contentId, reason },
      priority,
      status: 'queued',
      created_at: new Date(),
    });

    return { id: jobId, status: 'queued' };
  }

  async addBulkModerationJob(
    targetIds: number[],
    targetType: string,
    action: string,
    moderatorId: number,
    reason: string,
  ) {
    const jobId = `bulk_${targetType}_${Date.now()}`;
    console.log(
      `Adding bulk moderation job for ${targetIds.length} ${targetType}s`,
    );

    this.jobs.set(jobId, {
      id: jobId,
      type: 'bulk_moderation',
      payload: { targetIds, targetType, action, moderatorId, reason },
      status: 'queued',
      created_at: new Date(),
    });

    return { id: jobId, status: 'queued' };
  }

  async getQueueStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      waiting: jobs.filter((j) => j.status === 'queued').length,
      active: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      delayed: 0,
      total: jobs.length,
    };
  }

  async getJobStatus(jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    return {
      id: job.id,
      name: job.type,
      data: job.payload,
      state: job.status,
      created_at: job.created_at,
      processed_at: job.processed_at || null,
      finished_at: job.finished_at || null,
    };
  }

  async processNextJob() {
    // Simple FIFO processing for demonstration
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'queued') {
        job.status = 'processing';
        job.processed_at = new Date();

        // Simulate processing
        setTimeout(() => {
          job.status = 'completed';
          job.finished_at = new Date();
        }, 1000);

        return job;
      }
    }
    return null;
  }

  // Clean up old jobs
  async cleanOldJobs(maxAge: number = 24 * 60 * 60 * 1000) {
    // 24 hours
    const cutoff = new Date(Date.now() - maxAge);

    for (const [id, job] of this.jobs.entries()) {
      if (
        job.created_at < cutoff &&
        (job.status === 'completed' || job.status === 'failed')
      ) {
        this.jobs.delete(id);
      }
    }
  }
}
