import { CrmRecord, RawRow, SkippedRow } from '@groweasy/shared';

export interface JobProgress {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalBatches: number;
  completedBatches: number;
  totalRows: number;
  imported: CrmRecord[];
  skipped: SkippedRow[];
  error?: string;
}
