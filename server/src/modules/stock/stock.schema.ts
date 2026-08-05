import { z } from "zod";

export const createStockItemSchema = z.object({
  // Blank/omitted -> auto-generated from stockItemTypeId (see stockSku.ts); still overridable for
  // callers (e.g. CSV import) that already have a SKU scheme of their own. The form always sends
  // an empty string rather than omitting the key, so that needs to preprocess to undefined too.
  sku: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
  name: z.string().min(1),
  category: z.string().optional(),
  stockItemTypeId: z.number().int().nullable().optional(),
  unit: z.string().optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unitCost: z.number().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
});

export const updateStockItemSchema = createStockItemSchema.partial();

export const createTransactionSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  quantity: z.number().int().positive(),
  locationId: z.number().int(),
  reason: z.string().optional(),
});

export const createTransferSchema = z.object({
  fromLocationId: z.number().int(),
  toLocationId: z.number().int(),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});
