import { z } from "zod";

export const agentIngestSchema = z.object({
  hostname: z.string().min(1),
  macAddress: z.string().min(1),
  ipAddresses: z.array(z.string()).default([]),
  os: z.string().optional(),
  osVersion: z.string().optional(),
  cpu: z.string().optional(),
  ramGb: z.number().optional(),
  diskInfo: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  agentVersion: z.string().optional(),
  loggedInUser: z.string().optional(),
  lastLoginAt: z.string().datetime().optional(),
  installedSoftware: z.array(z.object({ name: z.string(), version: z.string().optional() })).optional(),
  batteryPresent: z.boolean().optional(),
  batteryPercent: z.number().min(0).max(100).optional(),
  batteryCharging: z.boolean().optional(),
});
