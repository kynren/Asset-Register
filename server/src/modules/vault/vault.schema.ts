import { z } from "zod";

export const createVaultEntrySchema = z.object({
  title: z.string().min(1),
  websiteUrl: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
  notes: z.string().optional(),
});

export const updateVaultEntrySchema = z.object({
  title: z.string().min(1).optional(),
  websiteUrl: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(1).optional(),
  notes: z.string().optional(),
});
