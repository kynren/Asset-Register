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
export type ActionName = "view" | "create" | "edit" | "delete" | "export" | "import";

export interface ModulePermission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  canImport: boolean;
}

export type PermissionMap = Partial<Record<ModuleName, ModulePermission>>;
