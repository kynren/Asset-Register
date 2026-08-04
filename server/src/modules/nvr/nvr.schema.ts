import { z } from "zod";

export const createNvrSchema = z.object({
  name: z.string().min(1),
  ipAddress: z.string().optional(),
  port: z.number().int().nullable().optional(),
  httpPort: z.number().int().nullable().optional(),
  protocol: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  locationId: z.number().int().nullable().optional(),
  model: z.string().optional(),
  notes: z.string().optional(),
});

export const updateNvrSchema = createNvrSchema.partial();

export const createCameraSchema = z.object({
  name: z.string().min(1),
  channel: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  ipAddress: z.string().optional(),
  port: z.number().int().nullable().optional(),
  httpPort: z.number().int().nullable().optional(),
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
  // Present when testing an already-saved NVR/Camera (not the blank "Add" form) — lets the route
  // persist the result onto that row so it's shown instantly next time instead of re-testing.
  // Mutually exclusive; at most one is ever sent, matching which form the button was rendered in.
  nvrId: z.number().int().optional(),
  cameraId: z.number().int().optional(),
});

export const discoverCamerasSchema = z.object({
  ipAddress: z.string().min(1),
  // ONVIF's SOAP/HTTP service — typically 80, never the RTSP port (554). Kept optional and
  // distinct from a stream port so a device already configured with an RTSP `port` doesn't have
  // that value silently reused for the ONVIF handshake — see Nvr.httpPort's schema comment.
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const startStreamSchema = z.object({
  streamUrl: z.string().regex(/^rtsps?:\/\//i, "Stream URL must start with rtsp:// or rtsps://"),
  // Present when starting live view for an already-saved camera (not the Add-form preview) — lets
  // the session do a fast reachability pre-check and persist its outcome onto that Camera row.
  cameraId: z.number().int().optional(),
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
  // ISAPI's HTTP port — typically 80/443, never the RTSP port (554). See Nvr.httpPort's schema
  // comment; the frontend sends the form's dedicated HTTP Port field here, not the RTSP `port`.
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  // Present when testing an already-saved NVR (ISAPI test-connection is NVR-only) — see
  // testConnectionSchema's nvrId comment for why.
  nvrId: z.number().int().optional(),
});
