import { RawRow, CrmRecord, SkippedRow } from '@groweasy/shared';
import { JobProgress } from '../types';
import { AiService } from './ai.service';
import pLimit from 'p-limit';
import pino from 'pino';

const logger = pino({ name: 'job-service' });

export type JobListener = (progress: JobProgress) => void;

export class JobService {
  private jobs = new Map<string, JobProgress>();
  private listeners = new Map<string, Set<JobListener>>();
  private aiService: AiService;

  constructor(aiService?: AiService) {
    this.aiService = aiService || new AiService();
  }

  public createJob(jobId: string, totalRows: number, totalBatches: number): JobProgress {
    const progress: JobProgress = {
      jobId,
      status: 'PENDING',
      totalBatches,
      completedBatches: 0,
      totalRows,
      imported: [],
      skipped: []
    };
    this.jobs.set(jobId, progress);
    return progress;
  }

  public getJob(jobId: string): JobProgress | undefined {
    return this.jobs.get(jobId);
  }

  public addListener(jobId: string, listener: JobListener): void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(listener);
  }

  public removeListener(jobId: string, listener: JobListener): void {
    const jobListeners = this.listeners.get(jobId);
    if (jobListeners) {
      jobListeners.delete(listener);
      if (jobListeners.size === 0) {
        this.listeners.delete(jobId);
      }
    }
  }

  private notify(jobId: string, progress: JobProgress): void {
    const jobListeners = this.listeners.get(jobId);
    if (jobListeners) {
      jobListeners.forEach(listener => listener(progress));
    }
  }

  public async startJob(
    jobId: string,
    rows: RawRow[],
    headers: string[],
    batchSize = 25,
    concurrency = 3
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'PROCESSING';
    this.notify(jobId, job);

    // Chunk rows into batches
    const batches: RawRow[][] = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      batches.push(rows.slice(i, i + batchSize));
    }

    job.totalBatches = batches.length;
    this.notify(jobId, job);

    const limit = pLimit(concurrency);

    const tasks = batches.map((batch, batchIndex) => {
      return limit(async () => {
        try {
          logger.info(`Job ${jobId}: Processing batch ${batchIndex + 1}/${batches.length}`);
          const result = await this.aiService.extractWithRetry(batch, headers);
          
          job.imported.push(...result.records);
          // Convert skipped info to SkippedRow
          const rawRowMap = new Map(batch.map(r => [r.sourceRowIndex, r]));
          const skippedRows: SkippedRow[] = result.skipped.map(s => ({
            row: rawRowMap.get(s.sourceRowIndex) || { sourceRowIndex: s.sourceRowIndex, raw: {} },
            reason: s.reason,
            rowIndex: s.sourceRowIndex
          }));
          job.skipped.push(...skippedRows);
        } catch (error) {
          logger.error(`Job ${jobId}: Batch ${batchIndex + 1} failed permanently. Marking all rows as skipped.`);
          // If a batch fails permanently after retries, skip all rows in this batch
          batch.forEach(row => {
            job.skipped.push({
              row,
              reason: `AI extraction failed for this batch: ${(error as Error).message}`,
              rowIndex: row.sourceRowIndex
            });
          });
        } finally {
          job.completedBatches++;
          this.notify(jobId, job);
        }
      });
    });

    try {
      await Promise.all(tasks);
      job.status = 'COMPLETED';
      logger.info(`Job ${jobId}: Completed processing all batches.`);
    } catch (err) {
      job.status = 'FAILED';
      job.error = (err as Error).message;
      logger.error(`Job ${jobId}: Job failed: ${job.error}`);
    } finally {
      this.notify(jobId, job);
    }
  }
}
