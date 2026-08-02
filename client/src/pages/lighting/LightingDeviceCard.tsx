// This file now only exports the LightingDevice type — the card UI itself was replaced by the
// ring-tile design in LightingDeviceTile.tsx (used on both the Dashboard and Devices tabs).
export interface LightingDevice {
  id: number;
  name: string;
  protocol: "SHELLY" | "TASMOTA" | "GENERIC_HTTP" | "ZIGBEE";
  ipAddress: string | null;
  port: number | null;
  gen: number | null;
  kind: "SWITCH" | "LIGHT" | null;
  onUrl: string | null;
  offUrl: string | null;
  statusUrl: string | null;
  statusOnPath: string | null;
  icon: string | null;
  sortOrder: number;
  groupId: number | null;
  location: { id: number; name: string } | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  isOn: boolean;
  brightness: number | null;
  powerW: number | null;
  lastCheckedAt: string | null;
}
