export const MODULES = [
  "dashboard",
  "assets",
  "harness",
  "network",
  "stock",
  "helpdesk",
  "operations",
  "nvr",
  "access-control",
  "lighting",
  "virtual-assistant",
  "docs",
  "admin",
  "password",
  "backups",
] as const;

export type ModuleName = (typeof MODULES)[number];

export const ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type ActionName = (typeof ACTIONS)[number];
