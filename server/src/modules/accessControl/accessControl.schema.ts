import { z } from "zod";

export const createDeviceSchema = z.object({
  name: z.string().min(1),
  ipAddress: z.string().optional(),
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  locationId: z.number().int().nullable().optional(),
  model: z.string().optional(),
  notes: z.string().optional(),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export const createDoorSchema = z.object({
  doorNumber: z.number().int().min(1),
  name: z.string().min(1),
});

export const updateDoorSchema = createDoorSchema.partial();

export const doorControlSchema = z.object({
  action: z.enum(["open", "close", "alwaysOpen", "alwaysClose", "resume"]),
});

export const isapiConnectionSchema = z.object({
  ipAddress: z.string().min(1),
  port: z.number().int().nullable().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

// Mirrors Hikvision's own UserInfo.RightPlan — one schedule template per door this credential
// may use. planTemplateNo references a template already configured on the controller itself
// (this app doesn't author templates); an empty array leaves the controller's own default
// access behavior in place, same as omitting RightPlan from the ISAPI call entirely.
const doorRightSchema = z.object({
  doorId: z.number().int().positive(),
  planTemplateNo: z.string().min(1).max(8).default("1"),
});

export const createCredentialSchema = z.object({
  userId: z.number().int(),
  cardNumber: z.string().min(1).optional(),
  hasPin: z.boolean().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  doorRights: z.array(doorRightSchema).default([]),
});

export const updateCredentialSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  doorRights: z.array(doorRightSchema).optional(),
});

export const syncEventsSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});
