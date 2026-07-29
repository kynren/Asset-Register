import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

// Excel and other tools commonly prefix CSV exports with a UTF-8 BOM, which csv-parse treats as
// an invalid leading character rather than stripping — so strip it ourselves before parsing.
function stripBom(buffer: Buffer): Buffer {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }
  return buffer;
}

export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  return parse(stripBom(buffer), { columns: true, skip_empty_lines: true, trim: true });
}

// Parses without assuming which row is the header, so the caller can let a user pick it.
// relax_column_count is required here: files commonly have a title row or trailing notes with a
// different column count than the real header, which is exactly what header-row selection exists to handle.
export function parseCsvRaw(buffer: Buffer): string[][] {
  return parse(stripBom(buffer), { columns: false, skip_empty_lines: true, trim: true, relax_column_count: true });
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return stringify(rows, { header: true, columns });
}
