import { RawRow, CrmRecord, CrmRecordSchema } from '@groweasy/shared';
import { z } from 'zod';
import pino from 'pino';

const logger = pino({ name: 'ai-service' });

// Response schema returned by the LLM
const LlmResponseSchema = z.object({
  records: z.array(CrmRecordSchema),
  skipped: z.array(
    z.object({
      sourceRowIndex: z.number(),
      reason: z.string()
    })
  )
});

export type LlmResponse = z.infer<typeof LlmResponseSchema>;

export interface AiExtractor {
  extractBatch(rows: RawRow[], headers: string[]): Promise<LlmResponse>;
}

export class GeminiAiExtractor implements AiExtractor {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  public async extractBatch(rows: RawRow[], headers: string[]): Promise<LlmResponse> {
    const systemPrompt = `You are a data-mapping engine for GrowEasy CRM. You will receive an array of raw CSV rows (each row is a JSON object of arbitrary column-name -> value pairs, taken from an unknown lead-export format such as Facebook Lead Ads, Google Ads, a real-estate CRM, or a manually built spreadsheet).

For EACH input row, map it to this exact CRM schema. Every field is optional except the skip rule below:

- created_at: lead creation date/time. Must be a string parseable by JavaScript's \`new Date(...)\`. Prefer ISO-like "YYYY-MM-DD HH:mm:ss". If no date is present, leave empty string.
- name: the lead's full name.
- email: the primary email address (first one found).
- country_code: phone country code, formatted like "+91". Infer from the phone number or explicit country if present; leave blank if not confidently inferable.
- mobile_without_country_code: the phone number with country code stripped, digits only (no spaces/dashes).
- company: company/organization name.
- city, state, country: location fields, only fill what's explicitly present or unambiguous - do not guess state/country from a phone country code alone.
- lead_owner: the salesperson/agent/owner email or name assigned to this lead.
- crm_status: MUST be exactly one of: "GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE". Infer from any status/stage/disposition column. If nothing indicates status, leave empty string - never invent one.
- crm_note: free-text bucket. Put here: remarks, follow-up notes, any additional comments, any 2nd+ email address, any 2nd+ phone number, and any other column's value that doesn't map to a field above but looks useful. Concatenate with "; " separators.
- data_source: MUST be exactly one of: "leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots" - only if the row confidently indicates one of these campaigns/projects. Otherwise leave empty string. Never guess.
- possession_time: property possession timeframe, only for real-estate leads, else empty string.
- description: any additional descriptive context not captured above.

RULES:
1. If a row has NEITHER a usable email NOR a usable mobile number, you must SKIP it - do not include it in "records"; instead add it to "skipped" with a short reason (e.g. "no email or phone number found").
   Note: Treat malformed placeholders like "N/A", "-", "none", or "null" as absent.
2. If multiple emails exist in a row, use the first as \`email\`, append the rest to \`crm_note\` prefixed "Additional email: ".
3. If multiple phone numbers exist, use the first as \`mobile_without_country_code\` (+ \`country_code\`), append the rest to \`crm_note\` prefixed "Additional phone: ".
4. Never fabricate data. Leave a field as an empty string "" if it cannot be confidently derived from the row.
5. Keep every value a single line - no literal newlines. If you must represent a line break inside crm_note or description, use the two characters backslash-n, never an actual newline.
6. \`crm_status\` and \`data_source\` must ONLY ever be one of their allowed values above, or "".
7. Return ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:

{
  "records": [ { "sourceRowIndex": number, "created_at": string, "name": string, "email": string, "country_code": string, "mobile_without_country_code": string, "company": string, "city": string, "state": string, "country": string, "lead_owner": string, "crm_status": string, "crm_note": string, "data_source": string, "possession_time": string, "description": string } ],
  "skipped": [ { "sourceRowIndex": number, "reason": string } ]
}

Here are the headers present in this CSV file for context:
${JSON.stringify(headers)}`;

    const userPrompt = `Here are the raw CSV rows for this batch, each tagged with its original index for traceability:
${JSON.stringify(rows)}

Map every row to the schema above following all rules. Return only the JSON object.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt}\n\n${userPrompt}`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
    }

    const data: any = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Find JSON block in case LLM added any thinking/text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Failed to find JSON in Gemini response: ${responseText}`);
    }

    const parsedJson = JSON.parse(jsonMatch[0]);
    const validated = LlmResponseSchema.parse(parsedJson);

    // Reconcile and filter
    const rowMap = new Map(rows.map(r => [r.sourceRowIndex, r]));
    const records: CrmRecord[] = [];
    const skipped: LlmResponse['skipped'] = [];

    // Process records
    for (const record of validated.records) {
      if (rowMap.has(record.sourceRowIndex)) {
        records.push(record);
      } else {
        logger.warn(`AI returned record with unexpected sourceRowIndex: ${record.sourceRowIndex}`);
      }
    }

    // Process skipped
    for (const skip of validated.skipped) {
      if (rowMap.has(skip.sourceRowIndex)) {
        skipped.push(skip);
      } else {
        logger.warn(`AI returned skipped row with unexpected sourceRowIndex: ${skip.sourceRowIndex}`);
      }
    }

    // Identify rows that were completely left out by LLM
    const seenIndices = new Set([
      ...records.map(r => r.sourceRowIndex),
      ...skipped.map(s => s.sourceRowIndex)
    ]);

    for (const row of rows) {
      if (!seenIndices.has(row.sourceRowIndex)) {
        logger.warn(`Row ${row.sourceRowIndex} not processed by LLM. Defaulting to skipped.`);
        skipped.push({
          sourceRowIndex: row.sourceRowIndex,
          reason: 'Omitted from AI mapping output'
        });
      }
    }

    return { records, skipped };
  }
}

export class AiService {
  private extractor: AiExtractor;

  constructor(extractor?: AiExtractor) {
    this.extractor = extractor || new GeminiAiExtractor();
  }

  /**
   * Run extraction with retry mechanism and exponential backoff
   */
  public async extractWithRetry(rows: RawRow[], headers: string[], retries = 2, delay = 1000): Promise<LlmResponse> {
    try {
      return await this.extractor.extractBatch(rows, headers);
    } catch (error) {
      if (retries > 0) {
        logger.warn(`AI extraction failed. Retrying in ${delay}ms... Error: ${(error as Error).message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.extractWithRetry(rows, headers, retries - 1, delay * 2);
      }
      throw error;
    }
  }
}
