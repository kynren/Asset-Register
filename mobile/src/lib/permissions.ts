// Mirrors client/src/lib/permissions.ts exactly — must stay in sync with the RBAC module list the
// server's role-permission table uses (see server/src/modules/auth/auth.service.ts getEffectivePermissionMap).
export const MODULES = [
  "dashboard",
  "assets",
  "harness",
  "operational-context",
  "network",
  "stock",
  "helpdesk",
  "operations",
  "nvr",
  "access-control",
  "lighting",
  "gates",
  "virtual-assistant",
  "docs",
  "reports",
  "admin",
  "password",
  "app-settings",
  "branding",
] as const;

export type ModuleName = (typeof MODULES)[number];
export type ActionName = "view" | "create" | "edit" | "delete" | "export" | "import" | "duplicate";

export interface ModulePermission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  canImport: boolean;
  canDuplicate: boolean;
}

export type PermissionMap = Partial<Record<ModuleName, ModulePermission>>;
