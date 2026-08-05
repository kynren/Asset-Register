export type DeviceStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

export interface Camera {
  id: number;
  nvrId: number;
  name: string;
  channel: number | null;
  locationId: number | null;
  location: { id: number; name: string } | null;
  ipAddress: string | null;
  streamUrl: string | null;
  ptzEnabled: boolean;
  status: DeviceStatus;
  lastCheckedAt: string | null;
  lastConnectionLatencyMs: number | null;
}

export interface Nvr {
  id: number;
  name: string;
  ipAddress: string;
  location: { id: number; name: string } | null;
  model: string | null;
  status: DeviceStatus;
  lastCheckedAt: string | null;
  cameras: Camera[];
}

export interface CameraEvent {
  id: number;
  cameraId: number | null;
  nvrId: number | null;
  type: string;
  message: string;
  createdAt: string;
  camera: { name: string } | null;
  nvr: { name: string } | null;
}
