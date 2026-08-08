export type DeviceLiveStatus = "ONLINE" | "OFFLINE";

// Mirrors shapeMonitoredDevice() in server/src/modules/network/network.routes.ts — snmpCommunity
// is stripped server-side and replaced with a boolean, snmpUpTimeTicks arrives as a string (BigInt
// isn't JSON-safe).
export interface SnmpInterface { index: number; name: string; adminStatus: string; operStatus: string; speedMbps: number | null; inOctets: number | null; outOctets: number | null }
export interface SnmpMacTableEntry { mac: string; port: string }
export interface SnmpLldpNeighbor { localPort: string | null; remoteChassisId: string | null; remotePortId: string | null; remoteSysName: string | null; protocol: "LLDP" | "CDP" }
export interface SnmpVlan { vlanId: number | string; name: string | null }
export interface SnmpPoeStatus { port: string; status: string }

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
  snmpPort?: number;
  snmpSysDescr: string | null;
  snmpSysName: string | null;
  snmpUpTimeTicks: string | null;
  snmpInterfaces?: SnmpInterface[] | null;
  snmpMacTable?: SnmpMacTableEntry[] | null;
  snmpLldpNeighbors?: SnmpLldpNeighbor[] | null;
  snmpVlans?: SnmpVlan[] | null;
  snmpPoeStatus?: SnmpPoeStatus[] | null;
  snmpLastPolledAt?: string | null;
  snmpLastError?: string | null;
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
