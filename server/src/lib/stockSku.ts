import { prisma } from "../config/prisma";

const DEFAULT_PREFIX = "KYN";

// Uppercase, alnum-only fragment derived from a type's display name (e.g. "Network Cables" ->
// "NETWORKCABLES") for use as both StockItemType.code and the middle segment of a generated SKU.
export function slugifyStockTypeCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 20) || "TYPE";
}

// SKU shape: <prefix>-<type code>-<6-digit random>, e.g. "KYN-LAPTOP-482910". Prefix is a
// per-tenant SystemSetting (App Settings > System Settings, key "stockSkuPrefix"), defaulting to
// "KYN" when unset so existing orgs don't need to configure anything to keep creating stock items.
export async function generateSku(typeCode: string): Promise<string> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "stockSkuPrefix" } });
  const prefix = (setting?.value || DEFAULT_PREFIX).toUpperCase();

  for (let attempt = 0; attempt < 10; attempt++) {
    const random = Math.floor(100000 + Math.random() * 900000);
    const sku = `${prefix}-${typeCode}-${random}`;
    const existing = await prisma.stockItem.findUnique({ where: { sku } });
    if (!existing) return sku;
  }
  throw new Error("Could not generate a unique SKU — try again.");
}
