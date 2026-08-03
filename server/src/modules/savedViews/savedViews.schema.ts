import { z } from "zod";

export const createSavedViewSchema = z.object({
  name: z.string().min(1).max(80),
  tableId: z.string().min(1),
  filters: z.record(z.any()),
});

export const renameSavedViewSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isDefault: z.literal(true).optional(),
});

export const filtersSchema = z.object({
  filters: z.record(z.any()),
});

export const shareSavedViewSchema = z
  .object({
    userId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    canEdit: z.boolean().default(false),
  })
  .refine((v) => (v.userId ? !v.teamId : !!v.teamId), { message: "Exactly one of userId or teamId is required" });
