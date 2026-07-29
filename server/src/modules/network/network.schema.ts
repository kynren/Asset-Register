import { z } from "zod";

export const nodeTypeEnum = z.enum(["DEVICE", "ROUTER", "SWITCH", "NVR", "OTHER"]);
export const nodeRoleEnum = z.enum(["CORE_SWITCH", "DISTRIBUTION_SWITCH", "EDGE_SWITCH", "GATEWAY_ROUTER", "HARDWARE_HOST"]);

export const createNodeSchema = z.object({
  type: nodeTypeEnum,
  role: nodeRoleEnum.nullable().optional(),
  label: z.string().min(1),
  ipAddress: z.string().optional(),
  subnet: z.string().optional(),
  posX: z.number().optional(),
  posY: z.number().optional(),
});

export const updateNodeSchema = createNodeSchema.partial();

export const createEdgeSchema = z.object({
  sourceId: z.number().int(),
  targetId: z.number().int(),
  label: z.string().optional(),
  bandwidthMbps: z.number().nullable().optional(),
});
