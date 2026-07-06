import Papa from 'papaparse';
import { RawRow } from '@groweasy/shared';

export class CsvService {
  /**
   * Parse CSV string/buffer into an array of RawRow objects
   */
  public static parseCsv(csvContent: string): { rows: RawRow[]; headers: string[] } {
    // Strip UTF-8 BOM if present
    let cleanContent = csvContent;
    if (cleanContent.charCodeAt(0) === 0xfeff) {
      cleanContent = cleanContent.slice(1);
    }

    const parseResult = Papa.parse<Record<string, string>>(cleanContent, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false
    });

    const headers = parseResult.meta.fields || [];
    
    // Map parsed results to our RawRow structure, filtering out empty rows
    const rows: RawRow[] = parseResult.data
      .map((row, index) => {
        // Strip out empty or null values
        const cleanRow: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          if (key && value !== undefined && value !== null) {
            cleanRow[key] = String(value).trim();
          }
        }
        return {
          sourceRowIndex: index,
          raw: cleanRow
        };
      })
      .filter(row => Object.keys(row.raw).length > 0);

    return { rows, headers };
  }
}
