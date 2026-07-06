import { describe, it, expect } from 'vitest';
import { CsvService } from './csv.service';

describe('CsvService', () => {
  it('should parse simple CSV content', () => {
    const csv = `name,email,phone\nJohn Doe,john@example.com,1234567890`;
    const { rows, headers } = CsvService.parseCsv(csv);

    expect(headers).toEqual(['name', 'email', 'phone']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      sourceRowIndex: 0,
      raw: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890'
      }
    });
  });

  it('should handle UTF-8 BOM', () => {
    const csv = `\uFEFFname,email\nJane,jane@example.com`;
    const { rows, headers } = CsvService.parseCsv(csv);

    expect(headers).toEqual(['name', 'email']);
    expect(rows[0].raw.name).toBe('Jane');
  });

  it('should skip empty rows', () => {
    const csv = `name,email\n\n\nJohn,john@example.com\n,,,\n`;
    const { rows } = CsvService.parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].raw.name).toBe('John');
  });

  it('should handle quoted fields with commas', () => {
    const csv = `name,address,email\n"Doe, John","123 Main St, NY",john@example.com`;
    const { rows } = CsvService.parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].raw.name).toBe('Doe, John');
    expect(rows[0].raw.address).toBe('123 Main St, NY');
  });
});
