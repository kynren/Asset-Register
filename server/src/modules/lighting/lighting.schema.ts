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

// ───────────────────────── Dashboard: Groups/Areas ─────────────────────────

export const createGroupSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
});

export const updateGroupSchema = createGroupSchema.partial();

export const reorderGroupsSchema = z.object({
  ids: z.array(z.number().int()),
});

export const moveDeviceSchema = z.object({
  groupId: z.number().int().nullable(),
  sortOrder: z.number().int().optional(),
});

export const updateDeviceIconSchema = z.object({
  icon: z.string().nullable(),
});

// ───────────────────────── Scenes ─────────────────────────

const sceneActionSchema = z.object({
  deviceId: z.number().int(),
  turnOn: z.boolean(),
  brightness: z.number().int().min(0).max(100).nullable().optional(),
});

export const createSceneSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  actions: z.array(sceneActionSchema).default([]),
});

export const updateSceneSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  actions: z.array(sceneActionSchema).optional(),
});

// ───────────────────────── Automations ─────────────────────────

export const createAutomationSchema = z
  .object({
    name: z.string().min(1),
    isEnabled: z.boolean().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use 24-hour HH:mm"),
    actionType: z.enum(["DEVICE", "SCENE"]),
    targetDeviceId: z.number().int().nullable().optional(),
    targetSceneId: z.number().int().nullable().optional(),
    turnOn: z.boolean().nullable().optional(),
  })
  .refine((v) => v.actionType !== "DEVICE" || (v.targetDeviceId != null && v.turnOn != null), {
    message: "A device action needs a target device and an on/off value.",
    path: ["targetDeviceId"],
  })
  .refine((v) => v.actionType !== "SCENE" || v.targetSceneId != null, {
    message: "A scene action needs a target scene.",
    path: ["targetSceneId"],
  });

// ───────────────────────── ZigBee (scaffold) ─────────────────────────

export const updateZigbeeCoordinatorSchema = z.object({
  serialPort: z.string().nullable(),
});

export const updateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use 24-hour HH:mm").optional(),
  actionType: z.enum(["DEVICE", "SCENE"]).optional(),
  targetDeviceId: z.number().int().nullable().optional(),
  targetSceneId: z.number().int().nullable().optional(),
  turnOn: z.boolean().nullable().optional(),
});
