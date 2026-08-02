import { PrismaClient } from "@prisma/client";
import { MODULES } from "../constants/modules";

type PermSet = Partial<Record<(typeof MODULES)[number], { canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; canExport?: boolean }>>;

const ALL_TRUE = { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true };
const VIEW_ONLY = { canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false };
const NO_ACCESS = { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false };

// Shared by prisma/seed.ts (the original install) and tenantProvisioning.ts (every new
// organization signed up afterwards) so the two never drift out of sync with each other.
export const ROLE_DEFS: { name: string; description: string; isSystem: boolean; perms: PermSet }[] = [
  {
    name: "System Admin",
    description: "Platform-level access: creates organizations, and owns App Settings (Backups, System Settings, System Status) — the only role that can grant itself to another user.",
    isSystem: true,
    perms: Object.fromEntries(MODULES.map((m) => [m, ALL_TRUE])) as PermSet,
  },
  {
    name: "Super Admin",
    // App Settings (Organizations, Backups, System Settings, System Status) is deliberately
    // excluded even from this otherwise-full-access role — it's reserved for System Admin only.
    description: "Full access to every module except App Settings.",
    isSystem: true,
    perms: { ...Object.fromEntries(MODULES.map((m) => [m, ALL_TRUE])), "app-settings": NO_ACCESS } as PermSet,
  },
  {
    name: "Admin",
    description: "Full operational access except App Settings, which is reserved for System Admin.",
    isSystem: true,
    perms: { ...Object.fromEntries(MODULES.map((m) => [m, ALL_TRUE])), "app-settings": NO_ACCESS } as PermSet,
  },
  {
    name: "IT Technician",
    description: "Manages assets, devices, network map, NVRs and operations tools.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: ALL_TRUE,
      network: ALL_TRUE,
      stock: VIEW_ONLY,
      helpdesk: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true },
      operations: ALL_TRUE,
      nvr: ALL_TRUE,
      "access-control": ALL_TRUE,
      lighting: ALL_TRUE,
      "virtual-assistant": VIEW_ONLY,
      docs: ALL_TRUE,
      admin: NO_ACCESS,
      password: ALL_TRUE,
    },
  },
  {
    name: "Helpdesk Agent",
    description: "Manages tickets end-to-end; view-only on assets.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: VIEW_ONLY,
      network: NO_ACCESS,
      stock: NO_ACCESS,
      helpdesk: ALL_TRUE,
      operations: NO_ACCESS,
      nvr: NO_ACCESS,
      "access-control": NO_ACCESS,
      lighting: NO_ACCESS,
      "virtual-assistant": VIEW_ONLY,
      docs: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: false },
      admin: NO_ACCESS,
      password: ALL_TRUE,
    },
  },
  {
    name: "Stock Manager",
    description: "Manages stock register and analytics; view-only on assets and dashboard.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: VIEW_ONLY,
      network: NO_ACCESS,
      stock: ALL_TRUE,
      helpdesk: NO_ACCESS,
      operations: NO_ACCESS,
      nvr: NO_ACCESS,
      "access-control": NO_ACCESS,
      lighting: NO_ACCESS,
      "virtual-assistant": VIEW_ONLY,
      docs: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: false },
      admin: NO_ACCESS,
      password: ALL_TRUE,
    },
  },
  {
    name: "Viewer",
    description: "Read-only access across the operational modules.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: VIEW_ONLY,
      network: VIEW_ONLY,
      stock: VIEW_ONLY,
      helpdesk: VIEW_ONLY,
      operations: NO_ACCESS,
      nvr: VIEW_ONLY,
      "access-control": VIEW_ONLY,
      lighting: VIEW_ONLY,
      "virtual-assistant": VIEW_ONLY,
      docs: VIEW_ONLY,
      admin: NO_ACCESS,
      password: ALL_TRUE,
    },
  },
];

export async function seedRoles(client: PrismaClient): Promise<void> {
  for (const def of ROLE_DEFS) {
    const role = await client.role.upsert({
      where: { name: def.name },
      update: { description: def.description, isSystem: def.isSystem },
      create: { name: def.name, description: def.description, isSystem: def.isSystem },
    });

    for (const module of MODULES) {
      const p = def.perms[module] ?? NO_ACCESS;
      await client.rolePermission.upsert({
        where: { roleId_module: { roleId: role.id, module } },
        update: p,
        create: { roleId: role.id, module, ...p },
      });
    }
  }
}
