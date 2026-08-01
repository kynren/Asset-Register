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
  // Set when testing from the Edit Device form, where the password field is deliberately left
  // blank ("leave blank to keep current password") rather than re-populated with the saved
  // secret. When password is empty and this is set, the route falls back to the device's already
  // -stored password instead of testing with a blank one.
  deviceId: z.number().int().optional(),
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
  personId: z.number().int(),
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

// ───────────────────────── ZigBee (scaffold) ─────────────────────────

export const updateZigbeeCoordinatorSchema = z.object({
  serialPort: z.string().nullable(),
});

// ───────────────────────── Person / Organization directory ─────────────────────────

export const createOrganizationSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const createPersonSchema = z.object({
  personId: z.string().min(1),
  name: z.string().min(1),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  organizationId: z.number().int().nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  longTermEffective: z.boolean().optional(),
  remark: z.string().optional(),
});

export const updatePersonSchema = createPersonSchema.partial();

export const createPersonCardSchema = z.object({
  cardNumber: z.string().min(1),
  cardType: z.string().optional(),
});

// ───────────────────────── Access Group ─────────────────────────

export const createAccessGroupSchema = z.object({
  name: z.string().min(1),
  planTemplateNo: z.string().min(1).max(8).optional(),
  personIds: z.array(z.number().int()).default([]),
  doorIds: z.array(z.number().int()).default([]),
});

export const updateAccessGroupSchema = z.object({
  name: z.string().min(1).optional(),
  planTemplateNo: z.string().min(1).max(8).optional(),
  personIds: z.array(z.number().int()).optional(),
  doorIds: z.array(z.number().int()).optional(),
});
