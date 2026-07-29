export const MODULES = [
  "dashboard",
  "assets",
  "network",
  "stock",
  "helpdesk",
  "operations",
  "nvr",
  "virtual-assistant",
  "admin",
] as const;

export type ModuleName = (typeof MODULES)[number];
export type ActionName = "view" | "create" | "edit" | "delete" | "export";

export interface ModulePermission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export type PermissionMap = Partial<Record<ModuleName, ModulePermission>>;
