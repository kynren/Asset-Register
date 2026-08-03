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
  notifyUserIds: z.array(z.number().int()).optional(),
  notifyEmails: z.array(z.string().email()).optional(),
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
  // Topology fields added alongside the original sysDescr/uptime/interfaces GET — see
  // agent/kynren_network_relay.py's snmp_get_topology(). All optional/defaulted since older
  // relay agent builds won't send them, and a relay that only got as far as the basic sysDescr
  // GET (sysInfoError set) sends these as empty rather than omitting the keys.
  sysName: z.string().nullable().default(null),
  macTable: z.array(z.object({ mac: z.string(), port: z.string() })).default([]),
  lldpNeighbors: z
    .array(
      z.object({
        localPort: z.string().nullable(),
        remoteChassisId: z.string().nullable(),
        remotePortId: z.string().nullable(),
        remoteSysName: z.string().nullable(),
        protocol: z.enum(["LLDP", "CDP"]),
      })
    )
    .default([]),
  vlans: z.array(z.object({ vlanId: z.union([z.number(), z.string()]), name: z.string().nullable() })).default([]),
  poeStatus: z.array(z.object({ port: z.string(), status: z.string() })).default([]),
});

export const relayCompleteSchema = z.object({
  results: z.array(relayHostResultSchema),
  snmpResults: z.array(relaySnmpResultSchema).default([]),
});

export const relayDiscoverySchema = z.object({
  subnets: z.array(z.object({ cidr: z.string().min(1), label: z.string().nullable().optional() })).default([]),
});

export const relayLogSchema = z.object({
  lines: z.array(z.string()).max(200),
});

// ───────────────────────── Generic relay device job (PING/HTTP) ─────────────────────────

export const relayDeviceJobCompleteSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED"]),
  responseStatus: z.number().int().optional(),
  responseHeaders: z.record(z.string()).optional(),
  responseBodyBase64: z.string().optional(),
  errorMessage: z.string().optional(),
});
