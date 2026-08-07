import { z } from "zod";

const rolePermissionSchema = z.object({
  module: z.string(),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canExport: z.boolean(),
  canImport: z.boolean(),
  canDuplicate: z.boolean(),
});

const systemSettingsPayloadSchema = z.object({ values: z.record(z.string()) });
const backupSettingsPayloadSchema = z.object({
  isEnabled: z.boolean(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
});
const rolePermissionsPayloadSchema = z.object({ permissions: z.array(rolePermissionSchema) });

// Discriminated on changeType so each variant only accepts the payload shape (and, for
// ROLE_PERMISSIONS, the targetId) that modules/scheduledChanges/scheduledChanges.service.ts's
// applyScheduledChange() dispatcher knows how to apply.
export const createScheduledChangeSchema = z.discriminatedUnion("changeType", [
  z.object({ changeType: z.literal("SYSTEM_SETTINGS"), payload: systemSettingsPayloadSchema, scheduledFor: z.coerce.date() }),
  z.object({ changeType: z.literal("BACKUP_SETTINGS"), payload: backupSettingsPayloadSchema, scheduledFor: z.coerce.date() }),
  z.object({ changeType: z.literal("ROLE_PERMISSIONS"), payload: rolePermissionsPayloadSchema, targetId: z.number().int(), scheduledFor: z.coerce.date() }),
]);

export const updateScheduledChangeSchema = z.object({
  payload: z.union([systemSettingsPayloadSchema, backupSettingsPayloadSchema, rolePermissionsPayloadSchema]).optional(),
  scheduledFor: z.coerce.date().optional(),
});
