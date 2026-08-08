import { z } from "zod";

// Same resource vocabulary ApiConnection uses (assets/tickets/stock/docs/network/users) — see
// apiConnections.schema.ts. Reused here so an admin only has to learn one picker even though this
// is the opposite direction (pulling another system's data in, not serving ours out).
const RESOURCE_ENUM = z.enum(["assets", "tickets", "stock", "docs", "network", "users"]);

export const createExternalConnectorSchema = z.object({
  name: z.string().min(1).max(120),
  baseUrl: z.string().url(),
  authHeaderName: z.string().min(1).max(120).default("Authorization"),
  authHeaderValue: z.string().min(1),
  direction: z.enum(["PUSH", "PULL", "BOTH"]).default("PULL"),
  resources: z.array(RESOURCE_ENUM).min(1),
});

export const updateExternalConnectorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().url().optional(),
  authHeaderName: z.string().min(1).max(120).optional(),
  // Omitted entirely on update = keep the existing encrypted value; sending an empty string is
  // rejected by min(1) below rather than silently clearing the credential.
  authHeaderValue: z.string().min(1).optional(),
  direction: z.enum(["PUSH", "PULL", "BOTH"]).optional(),
  resources: z.array(RESOURCE_ENUM).min(1).optional(),
  isEnabled: z.boolean().optional(),
});
