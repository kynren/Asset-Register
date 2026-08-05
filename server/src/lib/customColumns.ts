import { prisma } from "../config/prisma";

// Batch variant for list endpoints — one query instead of N, grouped by entityId, mirroring
// listRecordAccessBatch's shape (see lib/recordAccess.ts). Used by assets.controller/stock.controller
// list() to merge { [columnId]: value } onto each row without an extra round trip per row.
export async function listCustomColumnValuesBatch(entityType: string, entityIds: number[]): Promise<Map<number, Record<number, string | null>>> {
  if (entityIds.length === 0) return new Map();
  const columns = await prisma.customColumn.findMany({ where: { entityType }, select: { id: true } });
  if (columns.length === 0) return new Map();

  const rows = await prisma.customColumnValue.findMany({
    where: { customColumnId: { in: columns.map((c) => c.id) }, entityId: { in: entityIds } },
    select: { customColumnId: true, entityId: true, value: true },
  });

  const map = new Map<number, Record<number, string | null>>();
  for (const row of rows) {
    const values = map.get(row.entityId) ?? {};
    values[row.customColumnId] = row.value;
    map.set(row.entityId, values);
  }
  return map;
}
