import { z } from "zod";

export const createStockItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unitCost: z.number().nullable().optional(),
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
