import { z } from "zod";

export const createChangelogEntrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  items: z.array(z.string().min(1)).default([]),
  publishedAt: z.coerce.date().optional(),
});

export const updateChangelogEntrySchema = createChangelogEntrySchema.partial();
