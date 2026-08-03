import { z } from "zod";

export const createDashboardSchema = z.object({
  name: z.string().min(1).max(80),
  module: z.string().min(1),
  layout: z.array(z.record(z.any())).optional(),
});

export const renameDashboardSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isDefault: z.literal(true).optional(),
});

export const layoutSchema = z.object({
  layout: z.array(z.record(z.any())),
});

export const shareDashboardSchema = z
  .object({
    userId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    canEdit: z.boolean().default(false),
  })
  .refine((v) => (v.userId ? !v.teamId : !!v.teamId), { message: "Exactly one of userId or teamId is required" });
