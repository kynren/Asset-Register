import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return stringify(rows, { header: true, columns });
}
