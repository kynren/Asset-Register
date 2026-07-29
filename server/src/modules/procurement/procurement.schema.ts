import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const purchaseOrderItemInput = z.object({
  stockItemId: z.number().int(),
  quantityOrdered: z.number().int().positive(),
  unitCost: z.number().nullable().optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.number().int(),
  expectedAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseOrderItemInput).min(1),
});

export const updatePurchaseOrderSchema = z.object({
  status: z.enum(["DRAFT", "ORDERED", "RECEIVED", "CANCELLED"]).optional(),
  expectedAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

export const receivePurchaseOrderSchema = z.object({
  locationId: z.number().int(),
  lines: z.array(z.object({ purchaseOrderItemId: z.number().int(), quantityReceived: z.number().int().positive() })).min(1),
});
