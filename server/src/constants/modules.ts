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
  "virtual-assistant",
  "docs",
  "admin",
  "password",
  "app-settings",
] as const;

export type ModuleName = (typeof MODULES)[number];

export const ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type ActionName = (typeof ACTIONS)[number];
