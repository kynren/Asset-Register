export interface LightingDevice {
  id: number;
  name: string;
  protocol: string;
  icon: string | null;
  groupId: number | null;
  locationId: number | null;
  location: { id: number; name: string } | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  isOn: boolean | null;
  brightness: number | null;
  powerW: number | null;
  lastCheckedAt: string | null;
}

export interface LightingScene {
  id: number;
  name: string;
  icon: string | null;
}

export type DoorLockState = "LOCKED" | "UNLOCKED" | "UNKNOWN";
export type DoorControlAction = "open" | "close" | "alwaysOpen" | "alwaysClose" | "resume";

export interface AccessDoor {
  id: number;
  deviceId: number;
  doorNumber: number;
  name: string;
  lockState: DoorLockState;
  lastCheckedAt: string | null;
}

export interface AccessControlDevice {
  id: number;
  name: string;
  ipAddress: string | null;
  location: { id: number; name: string } | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  doors: AccessDoor[];
}
