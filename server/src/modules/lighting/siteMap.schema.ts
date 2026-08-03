import { z } from "zod";

export const createSiteMapSchema = z.object({ name: z.string().min(1) });

export const updateSiteMapSchema = z.object({ name: z.string().min(1).optional() });

const pointSchema = z.object({ x: z.number(), y: z.number() });

// CIRCLE stores a single radius (anchored to the placement's own x/y); POLYGON/PATH store an
// independent list of points, each in the same percentage coordinate space as x/y.
export const shapeDataSchema = z
  .union([z.object({ radius: z.number().positive() }), z.object({ points: z.array(pointSchema).min(2) })])
  .nullable()
  .optional();

export const placeDeviceSchema = z.object({
  deviceId: z.number().int(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const updatePlacementSchema = z.object({
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  shapeType: z.enum(["NONE", "CIRCLE", "POLYGON", "PATH"]).optional(),
  shapeData: shapeDataSchema,
  onIcon: z.string().nullable().optional(),
  offIcon: z.string().nullable().optional(),
  onColor: z.string().nullable().optional(),
  offColor: z.string().nullable().optional(),
  zoneOnColor: z.string().nullable().optional(),
});
