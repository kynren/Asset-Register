export type DeviceLiveStatus = "ONLINE" | "OFFLINE";

// Mirrors shapeMonitoredDevice() in server/src/modules/network/network.routes.ts — snmpCommunity
// is stripped server-side and replaced with a boolean, snmpUpTimeTicks arrives as a string (BigInt
// isn't JSON-safe).
export interface MonitoredNetworkDevice {
  id: number;
  key: string;
  ipAddress: string;
  macAddress: string | null;
  hostname: string | null;
  vendor: string | null;
  deviceType: string | null;
  os: string | null;
  loggedInUser: string | null;
  status: DeviceLiveStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  snmpEnabled: boolean;
  snmpConfigured: boolean;
  snmpSysDescr: string | null;
  snmpSysName: string | null;
  snmpUpTimeTicks: string | null;
}

export interface NetworkMonitorSummary {
  monitored: { total: number; online: number; offline: number };
  agent: { total: number; online: number; offline: number };
  subnetCount: number;
}

export interface PingResult {
  alive: boolean;
  responseTimeMs?: number | null;
}
