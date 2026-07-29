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

export const ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type ActionName = (typeof ACTIONS)[number];
