import { Request, Response } from 'express';
import { CsvService } from '../services/csv.service';
import { JobService } from '../services/job.service';
import { RawRow } from '@groweasy/shared';
import crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'import-controller' });

export class ImportController {
  private jobService: JobService;

  constructor(jobService?: JobService) {
    this.jobService = jobService || new JobService();
  }

  /**
   * Parse uploaded CSV file and return raw rows + headers
   */
  public parseCsvFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const { rows, headers } = CsvService.parseCsv(csvContent);

      // Max row guard (20,000 rows)
      if (rows.length > 20000) {
        res.status(400).json({ error: 'CSV exceeds limit of 20,000 rows. Please split the file.' });
        return;
      }

      res.status(200).json({ rows, headers });
    } catch (error) {
      logger.error(`CSV parsing error: ${(error as Error).message}`);
      res.status(500).json({ error: 'Failed to parse CSV file' });
    }
  };

  /**
   * Start AI extraction job asynchronously
   */
  public startExtraction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows, headers } = req.body as { rows: RawRow[]; headers: string[] };

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ error: 'Missing or empty rows array' });
        return;
      }

      // Max row guard
      if (rows.length > 20000) {
        res.status(400).json({ error: 'Rows exceed limit of 20,000. Please split the import.' });
        return;
      }

      const jobId = crypto.randomUUID();
      const batchSize = Number(process.env.BATCH_SIZE) || 25;
      const concurrency = Number(process.env.CONCURRENCY) || 3;
      const totalBatches = Math.ceil(rows.length / batchSize);

      // Create job in memory
      this.jobService.createJob(jobId, rows.length, totalBatches);

      // Start processing in the background
      this.jobService.startJob(jobId, rows, headers || [], batchSize, concurrency);

      res.status(202).json({ jobId });
    } catch (error) {
      logger.error(`Failed to start extraction: ${(error as Error).message}`);
      res.status(500).json({ error: 'Failed to initiate extraction job' });
    }
  };

  /**
   * SSE Endpoint to stream job progress
   */
  public streamJobStatus = (req: Request, res: Response): void => {
    const { jobId } = req.params;
    const job = this.jobService.getJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Encoding', 'none');
    res.flushHeaders();

    // Send initial status
    res.write(`data: ${JSON.stringify(job)}\n\n`);

    // Define progress listener
    const listener = (progress: any) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (progress.status === 'COMPLETED' || progress.status === 'FAILED') {
        res.write('event: end\ndata: done\n\n');
        cleanup();
      }
    };

    // Add listener
    this.jobService.addListener(jobId, listener);

    const cleanup = () => {
      this.jobService.removeListener(jobId, listener);
      res.end();
    };

    // Cleanup if client closes connection
    req.on('close', cleanup);
  };
}
