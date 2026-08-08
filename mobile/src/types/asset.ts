export type AssetStatus = "IN_USE" | "IN_STORAGE" | "IN_REPAIR" | "RETIRED" | "LOST";

export interface AssetCategory {
  id: number;
  name: string;
  isComputerAsset?: boolean;
}

export interface InstalledSoftwareEntry {
  name: string;
  version?: string;
}

export interface AssetLocation {
  id: number;
  name: string;
}

export interface AssetUserRef {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AssetDevice {
  id: number;
  hostname: string;
  macAddress: string;
  ipAddresses: string[];
  os: string | null;
  osVersion: string | null;
  cpu: string | null;
  ramGb: number | null;
  diskInfo: string | null;
  loggedInUser: string | null;
  lastLoginAt: string | null;
  lastSeen: string;
  batteryPresent: boolean | null;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  installedSoftware?: InstalledSoftwareEntry[] | null;
}

export interface AssetCustomFieldValue {
  id: number;
  value: string | null;
  field: { id: number; label: string; fieldKey: string; fieldType: string };
}

export interface AssetTicketRef {
  id: number;
  ticketNumber: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  itilType: "INCIDENT" | "REQUEST" | "PROBLEM" | "CHANGE";
  createdAt: string;
}

export interface Asset {
  id: number;
  assetTag: string;
  name: string;
  status: AssetStatus;
  categoryId: number | null;
  category: AssetCategory | null;
  locationId: number | null;
  location: AssetLocation | null;
  assignedToId: number | null;
  assignedTo: AssetUserRef | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  notes: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiresAt: string | null;
  nextServiceDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  signOffStatus: "PENDING" | "CONFIRMED";
  gridPowered: boolean;
  featuredImageUrl: string | null;
  staticIpAddress: string | null;
  subnetMask: string | null;
  defaultGateway: string | null;
  dnsServers: string | null;
  device: AssetDevice | null;
  customFieldValues: AssetCustomFieldValue[];
  customColumnValues?: Record<number, string | null>;
  tickets: AssetTicketRef[];
  remoteManagementEnabled: boolean;
  remoteManagementProtocol: string | null;
  remoteManagementUrl: string | null;
  isVirtual: boolean;
  hypervisor: string | null;
  vmHost: string | null;
  antivirusProduct: string | null;
  antivirusStatus: string | null;
  antivirusLastScanAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetHistoryEntry {
  id: number;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string } | null;
}

export interface AssetPhoto {
  id: number;
  url: string;
  createdAt: string;
}

export interface AssetCheckout {
  id: number;
  checkedOutAt: string;
  dueBackAt: string | null;
  checkedInAt: string | null;
  notes: string | null;
  checkedOutTo: { id: number; firstName: string; lastName: string } | null;
  checkedOutBy: { id: number; firstName: string; lastName: string } | null;
  checkedInBy: { id: number; firstName: string; lastName: string } | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const ASSET_STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: "IN_USE", label: "In Use" },
  { value: "IN_STORAGE", label: "In Storage" },
  { value: "IN_REPAIR", label: "In Repair" },
  { value: "RETIRED", label: "Retired" },
  { value: "LOST", label: "Lost" },
];
