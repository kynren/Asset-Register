import { z } from "zod";

export const protocolSchema = z.enum(["SHELLY", "TASMOTA", "GENERIC_HTTP"]);

// SHELLY/TASMOTA devices are addressed by IP; GENERIC_HTTP devices are addressed entirely by
// their own On/Off (and optional status) URLs, so ipAddress is only required for the former.
export const createDeviceSchema = z
  .object({
    name: z.string().min(1),
    protocol: protocolSchema.default("SHELLY"),
    ipAddress: z.string().optional(),
    port: z.number().int().nullable().optional(),
    locationId: z.number().int().nullable().optional(),
    onUrl: z.string().optional(),
    offUrl: z.string().optional(),
    statusUrl: z.string().optional(),
    statusOnPath: z.string().optional(),
  })
  .refine((v) => v.protocol === "GENERIC_HTTP" || Boolean(v.ipAddress), {
    message: "IP address is required for this device type.",
    path: ["ipAddress"],
  })
  .refine((v) => v.protocol !== "GENERIC_HTTP" || Boolean(v.onUrl && v.offUrl), {
    message: "On URL and Off URL are required for a Generic HTTP device.",
    path: ["onUrl"],
  });

export const updateDeviceSchema = z.object({
  name: z.string().min(1).optional(),
  ipAddress: z.string().optional(),
  port: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  onUrl: z.string().optional(),
  offUrl: z.string().optional(),
  statusUrl: z.string().optional(),
  statusOnPath: z.string().optional(),
  // protocol is intentionally not editable after creation — same reasoning as EmailTemplate's
  // eventType or Access Control's device gen: changing it would orphan fields the device row
  // was built with (gen/kind/channel vs. onUrl/offUrl/statusUrl mean different things per driver).
});

export const powerSchema = z.object({
  on: z.boolean(),
});

export const brightnessSchema = z.object({
  value: z.number().int().min(0).max(100),
});

export const discoverSchema = z.object({
  startIp: z.string().min(1),
  endIp: z.string().min(1),
});
