import { z } from 'zod';

export const CrmStatusEnum = z.enum(["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE", ""]);
export type CrmStatus = z.infer<typeof CrmStatusEnum>;

export const DataSourceEnum = z.enum(["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots", ""]);
export type DataSource = z.infer<typeof DataSourceEnum>;

export const CrmRecordSchema = z.object({
  created_at: z.string().default(""),
  name: z.string().default(""),
  email: z.string().default(""),
  country_code: z.string().default(""),
  mobile_without_country_code: z.string().default(""),
  company: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  country: z.string().default(""),
  lead_owner: z.string().default(""),
  crm_status: CrmStatusEnum.catch(""),
  crm_note: z.string().default(""),
  data_source: DataSourceEnum.catch(""),
  possession_time: z.string().default(""),
  description: z.string().default(""),
  sourceRowIndex: z.number()
});

export type CrmRecord = z.infer<typeof CrmRecordSchema>;

export interface RawRow {
  sourceRowIndex: number;
  raw: Record<string, string>;
}

export interface ExtractRequest {
  rows: RawRow[];
}

export interface SkippedRow {
  row: RawRow;
  reason: string;
  rowIndex: number;
}

export interface ExtractResponse {
  imported: CrmRecord[];
  skipped: SkippedRow[];
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
}
