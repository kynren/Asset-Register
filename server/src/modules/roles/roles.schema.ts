import { z } from "zod";
import { MODULES } from "../../constants/modules";

export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const updatePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      module: z.enum(MODULES),
      canView: z.boolean(),
      canCreate: z.boolean(),
      canEdit: z.boolean(),
      canDelete: z.boolean(),
      canExport: z.boolean(),
      canImport: z.boolean(),
      scopeAssignedOnly: z.boolean().optional(),
    })
  ),
});
