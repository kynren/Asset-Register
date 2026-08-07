import { z } from "zod";

const RESOURCE_ENUM = z.enum(["assets", "tickets", "stock", "docs", "network", "users"]);

export const createApiConnectionSchema = z.object({
  name: z.string().min(1).max(120),
  resources: z.array(RESOURCE_ENUM).min(1).default(["assets"]),
  canGet: z.boolean().default(true),
  canPost: z.boolean().default(false),
  canPut: z.boolean().default(false),
  canPatch: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  // System Admin only — enforced in the route handler, not here, since a Zod schema can't see
  // req.user. A non-System-Admin sending this is silently ignored rather than rejected, since it's
  // an escalation a regular org admin has no legitimate reason to ask for by accident.
  allOrganizations: z.boolean().default(false),
});

export const updateApiConnectionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  resources: z.array(RESOURCE_ENUM).min(1).optional(),
  canGet: z.boolean().optional(),
  canPost: z.boolean().optional(),
  canPut: z.boolean().optional(),
  canPatch: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  isActive: z.boolean().optional(),
  allOrganizations: z.boolean().optional(),
});
