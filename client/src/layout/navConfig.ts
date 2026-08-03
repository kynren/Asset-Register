import { ModuleName } from "../lib/permissions";

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  module?: ModuleName;
}

export interface NavGroup {
  label: string;
  icon: string;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

// "Controls" groups the physical/site-control modules (video, doors, lighting) under one
// collapsible section rather than three flat top-level items — kept as its own array (not
// spliced into systemConsoleNav) so Sidebar can render it distinctly and hide the whole group
// when the signed-in user has view access to none of its children.
export const controlsNavGroup: NavGroup = {
  label: "Controls",
  icon: "sliders",
  children: [
    { label: "NVRs & Cameras", path: "/nvr", icon: "nvr", module: "nvr" },
    { label: "Access Control", path: "/access-control", icon: "key", module: "access-control" },
    { label: "Lighting", path: "/lighting", icon: "bulb", module: "lighting" },
  ],
};

export const systemConsoleNav: NavItem[] = [
  { label: "Dashboard", path: "/", icon: "dashboard", module: "dashboard" },
  { label: "Asset Inventory", path: "/assets", icon: "assets", module: "assets" },
  { label: "Network Topology Map", path: "/network", icon: "network", module: "network" },
  { label: "Stock Register & Analytics", path: "/stock", icon: "stock", module: "stock" },
  { label: "Helpdesk & Ticketing", path: "/helpdesk", icon: "helpdesk", module: "helpdesk" },
  { label: "Operations Tools", path: "/operations", icon: "operations", module: "operations" },
  { label: "Docs & SOPs", path: "/docs", icon: "book", module: "docs" },
  { label: "Reports", path: "/reports", icon: "file", module: "reports" },
  { label: "Operational Context", path: "/operational-context", icon: "gauge", module: "operational-context" },
  { label: "Virtual Assistant", path: "/assistant", icon: "assistant", module: "virtual-assistant" },
  { label: "Password Management", path: "/password", icon: "password", module: "password" },
];

export const settingsNav: NavItem[] = [
  { label: "Profile", path: "/profile", icon: "profile" },
  { label: "Admin & Setup", path: "/admin", icon: "admin", module: "admin" },
  { label: "App Settings", path: "/app-settings", icon: "settings", module: "app-settings" },
];
