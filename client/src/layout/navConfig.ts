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

// "Controls" used to be a collapsible sidebar group containing NVRs & Cameras / Access Control /
// Lighting as indented sub-links. It's now a single top-level link to a /controls landing page
// (a grid of preview cards for each, see ControlsPage) with those three as real top-level pages —
// `children` is kept here only so Sidebar can decide whether to show the single "Controls" link
// at all (hidden when the user has view access to none of them) and so ControlsSubNav/ControlsPage
// share the same module list instead of redefining it.
export const controlsNavGroup: NavGroup = {
  label: "Controls",
  icon: "sliders",
  children: [
    { label: "NVRs & Cameras", path: "/nvr", icon: "nvr", module: "nvr" },
    { label: "Access Control", path: "/access-control", icon: "key", module: "access-control" },
    { label: "Lighting", path: "/lighting", icon: "bulb", module: "lighting" },
    { label: "Gates", path: "/gates", icon: "door", module: "gates" },
  ],
};

export const controlsNavItem: NavItem = { label: "Controls", path: "/controls", icon: "sliders" };

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
