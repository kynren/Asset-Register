import { z } from "zod";

const filterConditionSchema = z.object({ field: z.string(), operator: z.string(), value: z.any() });
const filterSpecSchema = z.object({
  combinator: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(filterConditionSchema).default([]),
});

export const createReportSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  source: z.string().min(1),
  filters: filterSpecSchema.optional().nullable(),
  columns: z.array(z.string()).optional().nullable(),
  groupBy: z.string().optional().nullable(),
  visualization: z.enum(["kpi", "table", "bar", "pie", "line"]).default("table"),
  sortBy: z.string().optional().nullable(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const updateReportSchema = createReportSchema.partial().extend({
  isDefault: z.literal(true).optional(),
});

export const shareReportSchema = z
  .object({
    userId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    canEdit: z.boolean().default(false),
  })
  .refine((v) => (v.userId ? !v.teamId : !!v.teamId), { message: "Exactly one of userId or teamId is required" });

export const previewReportSchema = z.object({
  source: z.string().min(1),
  filters: filterSpecSchema.optional().nullable(),
  columns: z.array(z.string()).optional().nullable(),
  groupBy: z.string().optional().nullable(),
  visualization: z.enum(["kpi", "table", "bar", "pie", "line"]).default("table"),
});

export const emailReportSchema = z.object({
  to: z.array(z.string().email()).min(1).max(20),
  format: z.enum(["pdf", "csv"]).default("pdf"),
  message: z.string().max(1000).optional(),
});
