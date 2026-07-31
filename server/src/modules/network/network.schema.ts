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

export const monitorRangeSchema = z.object({
  startIp: z.string().min(1),
  endIp: z.string().min(1),
  label: z.string().optional(),
});

export const updateMonitorSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(1440),
  ranges: z.array(monitorRangeSchema),
});

export const updateSnmpConfigSchema = z.object({
  snmpEnabled: z.boolean(),
  snmpCommunity: z.string().min(1).nullable().optional(),
  snmpPort: z.number().int().min(1).max(65535).optional(),
});

// ───────────────────────── Network relay agent ─────────────────────────

export const relayProgressSchema = z.object({
  scannedHosts: z.number().int().min(0),
  aliveHosts: z.number().int().min(0),
});

const relayHostResultSchema = z.object({
  ipAddress: z.string().min(1),
  alive: z.boolean(),
  hostname: z.string().nullable().default(null),
  macAddress: z.string().nullable().default(null),
  openPorts: z.array(z.number().int()).default([]),
  responseTimeMs: z.number().nullable().default(null),
});

const relaySnmpResultSchema = z.object({
  deviceId: z.number().int(),
  sysDescr: z.string().nullable().default(null),
  upTimeTicks: z.number().nullable().default(null),
  interfaces: z.array(z.record(z.any())).default([]),
  error: z.string().nullable().default(null),
});

export const relayCompleteSchema = z.object({
  results: z.array(relayHostResultSchema),
  snmpResults: z.array(relaySnmpResultSchema).default([]),
});
