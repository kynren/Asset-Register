/**
 * Protocol dispatcher for the Lighting module. Every route in lighting.routes.ts calls
 * through here instead of importing shellyApi.ts / tasmotaApi.ts directly — this is the one
 * place that knows "if protocol is X, call driver X's function", so adding a fourth driver
 * later only means writing its client module and adding one case in each function below.
 */
import { detectShelly, getShellyStatus, setShellyBrightness, setShellyPower } from "./shellyApi";
import { detectTasmota, getTasmotaStatus, setTasmotaBrightness, setTasmotaPower } from "./tasmotaApi";
import { isNetworkRelayEnabled } from "../modules/network/scan.service";
import { relayAwareFetch } from "./relayTransport";

export type LightingProtocolName = "SHELLY" | "TASMOTA" | "GENERIC_HTTP" | "ZIGBEE";
export type LightingKindName = "SWITCH" | "LIGHT";

export interface IotDeviceLike {
  protocol: LightingProtocolName;
  ipAddress: string | null;
  port: number | null;
  gen: number | null;
  kind: LightingKindName | null;
  channel: number;
  onUrl: string | null;
  offUrl: string | null;
  statusUrl: string | null;
  statusOnPath: string | null;
}

export interface IotStatus {
  on: boolean;
  brightness: number | null;
  powerW: number | null;
}

export interface IotDetection {
  gen: number | null;
  kind: LightingKindName;
  /** Independently-controllable outputs on the physical device (Shelly only, e.g. 2 for a
   * Shelly 2PM). Always 1 for TASMOTA/GENERIC_HTTP — see createShellyOutputDevices in
   * lighting.routes.ts for how a multi-output Shelly becomes one LightingDevice per output. */
  outputs: number;
}

// ZIGBEE devices are paired (not IP-probed) — see zigbeeCoordinator.ts. Every dispatcher
// function below throws the same clear "coordinator not connected" error for ZIGBEE until a
// real coordinator integration lands; this is NOT hardware-verified, there being no ZigBee
// coordinator available in this environment.
const ZIGBEE_NOT_CONNECTED = "ZigBee coordinator is not connected. Configure and connect a coordinator under the ZigBee tab first.";

/** Whether this device still needs a detection pass before it can be polled/controlled.
 * GENERIC_HTTP never does — its "kind" is just whatever the user picked at add time. ZIGBEE
 * devices are already fully known once paired, so they never need a separate detection pass. */
export function needsDetection(protocol: LightingProtocolName, gen: number | null, kind: LightingKindName | null): boolean {
  if (protocol === "GENERIC_HTTP" || protocol === "ZIGBEE") return false;
  if (protocol === "SHELLY") return gen === null || kind === null;
  return kind === null; // TASMOTA has no "gen" concept
}

export async function detectIotDevice(device: IotDeviceLike): Promise<IotDetection> {
  if (device.protocol === "ZIGBEE") throw new Error(ZIGBEE_NOT_CONNECTED);
  if (!device.ipAddress) throw new Error("This device has no IP address set.");
  if (device.protocol === "SHELLY") return detectShelly(device.ipAddress, device.port);
  if (device.protocol === "TASMOTA") {
    const d = await detectTasmota(device.ipAddress, device.port);
    return { gen: null, kind: d.kind, outputs: 1 };
  }
  return { gen: null, kind: device.kind ?? "SWITCH", outputs: 1 };
}

/** Returns `null` when there's genuinely nothing to poll (a GENERIC_HTTP device with no
 * status URL configured) — callers should leave the device's last-known state untouched in
 * that case rather than treating "can't read status" the same as "device is offline". */
export async function getIotStatus(device: IotDeviceLike): Promise<IotStatus | null> {
  switch (device.protocol) {
    case "SHELLY": {
      if (!device.ipAddress || device.gen === null || !device.kind) throw new Error("Device not fully detected yet.");
      return getShellyStatus(device.ipAddress, device.port, device.gen, device.kind, device.channel);
    }
    case "TASMOTA": {
      if (!device.ipAddress || !device.kind) throw new Error("Device not fully detected yet.");
      const s = await getTasmotaStatus(device.ipAddress, device.port, device.kind, device.channel);
      return { on: s.on, brightness: s.brightness, powerW: null };
    }
    case "GENERIC_HTTP": {
      if (!device.statusUrl) return null;
      const on = await fetchGenericStatus(device.statusUrl, device.statusOnPath);
      return { on, brightness: null, powerW: null };
    }
    case "ZIGBEE":
      throw new Error(ZIGBEE_NOT_CONNECTED);
  }
}

export async function setIotPower(device: IotDeviceLike, on: boolean): Promise<void> {
  switch (device.protocol) {
    case "SHELLY": {
      if (!device.ipAddress || device.gen === null || !device.kind) throw new Error("Device not fully detected yet.");
      await setShellyPower(device.ipAddress, device.port, device.gen, device.kind, device.channel, on);
      return;
    }
    case "TASMOTA": {
      if (!device.ipAddress) throw new Error("This device has no IP address set.");
      await setTasmotaPower(device.ipAddress, device.port, device.channel, on);
      return;
    }
    case "GENERIC_HTTP": {
      const url = on ? device.onUrl : device.offUrl;
      if (!url) throw new Error(`No ${on ? "On" : "Off"} URL configured for this device.`);
      await fetchGenericControl(url);
      return;
    }
    case "ZIGBEE":
      throw new Error(ZIGBEE_NOT_CONNECTED);
  }
}

export async function setIotBrightness(device: IotDeviceLike, value: number): Promise<void> {
  switch (device.protocol) {
    case "SHELLY": {
      if (!device.ipAddress || device.gen === null) throw new Error("Device not fully detected yet.");
      await setShellyBrightness(device.ipAddress, device.port, device.gen, "LIGHT", device.channel, value);
      return;
    }
    case "TASMOTA": {
      if (!device.ipAddress) throw new Error("This device has no IP address set.");
      await setTasmotaBrightness(device.ipAddress, device.port, value);
      return;
    }
    case "GENERIC_HTTP":
      throw new Error("Brightness control isn't supported for Generic HTTP devices.");
    case "ZIGBEE":
      throw new Error(ZIGBEE_NOT_CONNECTED);
  }
}

// ───────────────────────── GENERIC_HTTP helpers ─────────────────────────

const GENERIC_TIMEOUT_MS = 4000;

function isOnValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return !["off", "false", "0", ""].includes(value.trim().toLowerCase());
  return Boolean(value);
}

/** `path` is a simple dot-notation lookup into the JSON response, e.g. "power" or "state.on".
 * Left blank, the whole response body just has to be JSON-truthy. */
async function fetchGenericStatus(url: string, path: string | null): Promise<boolean> {
  if (await isNetworkRelayEnabled()) {
    const res = await relayAwareFetch(url, { timeoutMs: GENERIC_TIMEOUT_MS });
    if (!res.ok) throw new Error(`Status URL responded with HTTP ${res.status}.`);
    const data = await res.json().catch(() => null);
    if (!path) return isOnValue(data);
    const value = path.split(".").reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), data);
    return isOnValue(value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERIC_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Status URL responded with HTTP ${res.status}.`);
    const data = await res.json().catch(() => null);
    if (!path) return isOnValue(data);
    const value = path.split(".").reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), data);
    return isOnValue(value);
  } catch (err) {
    throw new Error(err instanceof Error && err.name === "AbortError" ? "Status URL timed out." : (err as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGenericControl(url: string): Promise<void> {
  if (await isNetworkRelayEnabled()) {
    const res = await relayAwareFetch(url, { timeoutMs: GENERIC_TIMEOUT_MS });
    if (!res.ok) throw new Error(`Control URL responded with HTTP ${res.status}.`);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERIC_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Control URL responded with HTTP ${res.status}.`);
  } catch (err) {
    throw new Error(err instanceof Error && err.name === "AbortError" ? "Control URL timed out." : (err as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}
