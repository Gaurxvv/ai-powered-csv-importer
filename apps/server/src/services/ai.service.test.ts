import { describe, it, expect, vi } from 'vitest';
import { AiService, AiExtractor, LlmResponse } from './ai.service';
import { RawRow } from '@groweasy/shared';

describe('AiService with Mock Extractor', () => {
  it('should return successfully mapped records', async () => {
    const mockExtractor: AiExtractor = {
      extractBatch: vi.fn().mockResolvedValue({
        records: [
          {
            sourceRowIndex: 0,
            created_at: '2026-07-06 12:00:00',
            name: 'John Doe',
            email: 'john@example.com',
            country_code: '+1',
            mobile_without_country_code: '1234567890',
            company: 'Acme Corp',
            city: 'New York',
            state: 'NY',
            country: 'USA',
            lead_owner: 'sales@example.com',
            crm_status: 'GOOD_LEAD_FOLLOW_UP',
            crm_note: '',
            data_source: 'leads_on_demand',
            possession_time: '',
            description: ''
          }
        ],
        skipped: []
      } as LlmResponse)
    };

    const aiService = new AiService(mockExtractor);
    const rows: RawRow[] = [{ sourceRowIndex: 0, raw: { name: 'John Doe', email: 'john@example.com', phone: '+11234567890' } }];
    const result = await aiService.extractWithRetry(rows, ['name', 'email', 'phone']);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].name).toBe('John Doe');
    expect(result.records[0].crm_status).toBe('GOOD_LEAD_FOLLOW_UP');
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockExtractor: AiExtractor = {
      extractBatch: vi.fn()
        .mockRejectedValueOnce(new Error('API Timeout'))
        .mockResolvedValueOnce({
          records: [],
          skipped: [{ sourceRowIndex: 0, reason: 'no email or phone number found' }]
        } as LlmResponse)
    };

    const aiService = new AiService(mockExtractor);
    const rows: RawRow[] = [{ sourceRowIndex: 0, raw: { name: 'Empty row' } }];
    const result = await aiService.extractWithRetry(rows, ['name'], 2, 10); // low delay for fast test

    expect(mockExtractor.extractBatch).toHaveBeenCalledTimes(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('no email or phone number found');
  });
});
