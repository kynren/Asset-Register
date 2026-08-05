import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { slugifyStockTypeCode } from "./stockSku";

// StockItem.category was free text before StockItemType existed. Runs once at boot, per
// organization schema, and is idempotent — it only touches stock items that still have a
// category but no stockItemTypeId, so it's a no-op on every restart once it's caught up. category
// itself is left populated (dataExplorer.ts still groups reports by it).
async function backfillOrg(): Promise<void> {
  const items = await prisma.stockItem.findMany({
    where: { category: { not: null }, stockItemTypeId: null },
    select: { id: true, category: true },
  });
  if (items.length === 0) return;

  const distinctCategories = [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => Boolean(c)))];
  const typeIdByCategory = new Map<string, number>();

  for (const category of distinctCategories) {
    const existing = await prisma.stockItemType.findFirst({ where: { name: category } });
    if (existing) {
      typeIdByCategory.set(category, existing.id);
      continue;
    }
    const base = slugifyStockTypeCode(category);
    let code = base;
    let suffix = 1;
    while (await prisma.stockItemType.findUnique({ where: { code } })) {
      suffix += 1;
      code = `${base.slice(0, 18)}${suffix}`;
    }
    const type = await prisma.stockItemType.create({ data: { name: category, code } });
    typeIdByCategory.set(category, type.id);
  }

  for (const item of items) {
    const category = item.category?.trim();
    const typeId = category ? typeIdByCategory.get(category) : undefined;
    if (typeId) await prisma.stockItem.update({ where: { id: item.id }, data: { stockItemTypeId: typeId } });
  }
}

export async function backfillStockItemTypes(): Promise<void> {
  await runForEachOrganization(backfillOrg);
}
