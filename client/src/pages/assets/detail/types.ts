export interface AssetDetail {
  id: number;
  assetTag: string;
  name: string;
  status: string;
  signOffStatus: string;
  categoryId: number | null;
  category: { id: number; name: string; isComputerAsset: boolean; capacities: string[] | null } | null;
  locationId: number | null;
  location: { id: number; name: string; address: string | null } | null;
  assignedToId: number | null;
  assignedTo: { id: number; firstName: string; lastName: string; email: string } | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  warrantyExpiresAt: string | null;
  nextServiceDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  deviceId: number | null;
  device: {
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
    installedSoftware: { name: string; version?: string }[] | null;
    batteryPresent: boolean | null;
    batteryPercent: number | null;
    batteryCharging: boolean | null;
    lastSeen: string;
  } | null;
  tickets: {
    id: number;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
  }[];
  customFieldValues?: {
    id: number;
    fieldId: number;
    value: string | null;
    field: { id: number; label: string; fieldKey: string; fieldType: string };
  }[];

  featuredImageUrl: string | null;
  gridPowered: boolean;

  remoteManagementEnabled: boolean;
  remoteManagementProtocol: string | null;
  remoteManagementUrl: string | null;

  staticIpAddress: string | null;
  subnetMask: string | null;
  defaultGateway: string | null;
  dnsServers: string | null;

  isVirtual: boolean;
  hypervisor: string | null;
  vmHost: string | null;

  antivirusProduct: string | null;
  antivirusStatus: string | null;
  antivirusLastScanAt: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface AssetPhoto {
  id: number;
  assetId: number;
  url: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string } | null;
}
