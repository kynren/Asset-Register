import { parseCsvBuffer } from "./csv";

// Generic "one row = one create call" importer for flat reference-data resources (Locations,
// Suppliers, Ticket Categories, Teams, ...). Header-keyed (via parseCsvBuffer), not
// position-mapped — callers read whichever header names their resource cares about off each row.
// A bad row doesn't abort the batch; its message is collected and the rest still import, mirroring
// assets.controller.ts's importCsv per-row error handling.
export async function importCsvRows(
  buffer: Buffer,
  createRow: (row: Record<string, string>, index: number) => Promise<unknown>
): Promise<{ created: number; errors: string[] }> {
  const rows = parseCsvBuffer(buffer);
  let created = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      await createRow(rows[i], i);
      created++;
    } catch (err: any) {
      errors.push(`Row ${i + 2}: ${err.message ?? "Unknown error"}`);
    }
  }
  return { created, errors };
}
