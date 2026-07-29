import { z } from "zod";

export const createNvrSchema = z.object({
  name: z.string().min(1),
  ipAddress: z.string().optional(),
  port: z.number().int().nullable().optional(),
  protocol: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  location: z.string().optional(),
  model: z.string().optional(),
  notes: z.string().optional(),
});

export const updateNvrSchema = createNvrSchema.partial();

export const createCameraSchema = z.object({
  name: z.string().min(1),
  channel: z.number().int().nullable().optional(),
  location: z.string().optional(),
  ipAddress: z.string().optional(),
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  streamUrl: z.string().optional(),
  ptzEnabled: z.boolean().optional(),
  status: z.enum(["ONLINE", "OFFLINE", "UNKNOWN"]).optional(),
});

export const updateCameraSchema = createCameraSchema.partial();

export const ptzCommandSchema = z.object({
  command: z.enum(["UP", "DOWN", "LEFT", "RIGHT", "ZOOM_IN", "ZOOM_OUT", "HOME"]),
  speed: z.number().int().min(1).max(10).optional(),
});

export const gotoPresetSchema = z.object({
  presetToken: z.string().min(1),
});

export const cameraEventSchema = z.object({
  type: z.string().min(1),
  message: z.string().optional(),
});

export const testConnectionSchema = z.object({
  ipAddress: z.string().min(1),
  port: z.number().int().nullable().optional(),
  protocol: z.string().optional(),
});

export const discoverCamerasSchema = z.object({
  ipAddress: z.string().min(1),
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const startStreamSchema = z.object({
  streamUrl: z.string().regex(/^rtsps?:\/\//i, "Stream URL must start with rtsp:// or rtsps://"),
});

export const importCamerasSchema = z.object({
  channels: z
    .array(
      z.object({
        name: z.string().min(1),
        streamUri: z.string().nullable().optional(),
        snapshotUri: z.string().nullable().optional(),
        channel: z.number().int().nullable().optional(),
        // Present when importing ISAPI channels — the proxied channel is reachable via the
        // parent NVR's own ISAPI host/credentials, so those are persisted on the Camera row.
        ipAddress: z.string().nullable().optional(),
        port: z.number().int().nullable().optional(),
        username: z.string().nullable().optional(),
        password: z.string().nullable().optional(),
      })
    )
    .min(1),
});

export const isapiConnectionSchema = z.object({
  ipAddress: z.string().min(1),
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});
