import { z } from "zod";

export const createApiConnectionSchema = z.object({
  name: z.string().min(1).max(120),
  resources: z.array(z.enum(["assets"])).min(1).default(["assets"]),
  canGet: z.boolean().default(true),
  canPost: z.boolean().default(false),
  canPut: z.boolean().default(false),
  canPatch: z.boolean().default(false),
  canDelete: z.boolean().default(false),
});

export const updateApiConnectionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  resources: z.array(z.enum(["assets"])).min(1).optional(),
  canGet: z.boolean().optional(),
  canPost: z.boolean().optional(),
  canPut: z.boolean().optional(),
  canPatch: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
