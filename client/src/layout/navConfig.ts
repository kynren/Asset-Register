import { ModuleName } from "../lib/permissions";

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  module?: ModuleName;
}

export const systemConsoleNav: NavItem[] = [
  { label: "Dashboard", path: "/", icon: "dashboard", module: "dashboard" },
  { label: "Asset Inventory", path: "/assets", icon: "assets", module: "assets" },
  { label: "Harness Register", path: "/harness", icon: "shield", module: "assets" },
  { label: "Network Topology Map", path: "/network", icon: "network", module: "network" },
  { label: "Stock Register & Analytics", path: "/stock", icon: "stock", module: "stock" },
  { label: "Helpdesk & Ticketing", path: "/helpdesk", icon: "helpdesk", module: "helpdesk" },
  { label: "Operations Tools", path: "/operations", icon: "operations", module: "operations" },
  { label: "NVRs & Cameras", path: "/nvr", icon: "nvr", module: "nvr" },
  { label: "Access Control", path: "/access-control", icon: "key", module: "access-control" },
  { label: "Docs & SOPs", path: "/docs", icon: "book", module: "docs" },
  { label: "Operational Context", path: "/operational-context", icon: "gauge", module: "assets" },
  { label: "Virtual Assistant", path: "/assistant", icon: "assistant", module: "virtual-assistant" },
];

export const settingsNav: NavItem[] = [
  { label: "Profile", path: "/profile", icon: "profile" },
  { label: "Admin & Setup", path: "/admin", icon: "admin", module: "admin" },
  { label: "Password Management", path: "/password", icon: "password" },
];
