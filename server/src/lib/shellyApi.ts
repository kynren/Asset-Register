/**
 * Local network client for Shelly smart-home devices (switches and dimmable lights),
 * controlled directly over local Wi-Fi — no Shelly Cloud account, no internet dependency.
 *
 * Shelly devices speak one of two local APIs depending on hardware generation:
 *
 * - Gen 1 ("classic" — original Shelly 1, Shelly Dimmer 1/2, Shelly Plug, ...): a plain
 *   REST-style API, all GET requests with query-string parameters.
 *     GET /status                          -> full device state
 *     GET /relay/0?turn=on|off             -> switch control
 *     GET /light/0?turn=on&brightness=50   -> dimmer control
 *
 * - Gen 2 / Gen 3 (Shelly Plus / Pro line, e.g. Shelly Plus 1): a JSON-RPC-style API,
 *   always as an HTTP POST to a single /rpc endpoint.
 *     POST /rpc {"method":"Switch.Set","params":{"id":0,"on":true}}
 *     POST /rpc {"method":"Light.Set","params":{"id":0,"on":true,"brightness":75}}
 *
 * GET /shelly is answered identically by every generation and is the standard way to
 * tell them apart locally: Gen2/3 responses carry a "gen": 2|3 field; Gen1 responses
 * never do. `detectShelly()` calls it once per device; the result (gen + whether the
 * channel is a plain switch or a dimmable light) is cached by the caller in the
 * LightingDevice row so a normal status poll only needs one follow-up request.
 */

const TIMEOUT_MS = 4000;

export type ShellyKind = "SWITCH" | "LIGHT";

export class ShellyError extends Error {}

function connectionErrorMessage(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  if (e?.name === "AbortError") return "Connection timed out.";
  const code = e?.code ?? e?.cause?.code;
  if (code === "ECONNREFUSED") return "Connection refused — nothing is listening on that host/port.";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return "Host unreachable.";
  return e?.message ?? "Unknown network error.";
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new ShellyError(connectionErrorMessage(err));
  } finally {
    clearTimeout(timeout);
  }
}

function baseUrl(ip: string, port?: number | null): string {
  return `http://${ip}:${port ?? 80}`;
}

let rpcId = 1;

async function rpc(ip: string, port: number | null | undefined, method: string, params?: Record<string, unknown>): Promise<any> {
  const res = await fetchWithTimeout(`${baseUrl(ip, port)}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: rpcId++, method, params }),
  });
  if (!res.ok) throw new ShellyError(`Device responded with HTTP ${res.status}.`);
  const data: any = await res.json().catch(() => ({}));
  if (data.error) throw new ShellyError(`Device reported an error: ${JSON.stringify(data.error)}`);
  return data.result ?? {};
}

async function gen1(ip: string, port: number | null | undefined, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${baseUrl(ip, port)}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new ShellyError(`Device responded with HTTP ${res.status}.`);
  return res.json().catch(() => ({}) as any);
}

export interface ShellyDetection {
  gen: number;
  kind: ShellyKind;
  /** How many independently-controllable outputs this physical device has (e.g. 2 for a
   * Shelly 2PM, 4 for a Shelly Pro 4PM). The caller creates one LightingDevice row per
   * output — see lighting.routes.ts — since each output is switched/dimmed independently. */
  outputs: number;
}

/**
 * Works out which generation a device is, whether its channels are plain switches or
 * dimmable lights, and how many outputs it has. There's no single field that reliably
 * says "this is a light" across every Gen2/3 model, so Switch.GetStatus is tried first
 * and Light.GetStatus is the fallback — whichever one the device actually answers wins,
 * rather than maintaining a hardcoded model list.
 */
export async function detectShelly(ip: string, port: number | null | undefined): Promise<ShellyDetection> {
  const info = await gen1(ip, port, "/shelly");
  const gen = typeof info.gen === "number" ? info.gen : 1;

  if (gen === 1) {
    const status = await gen1(ip, port, "/status");
    const lightCount = Array.isArray(status.lights) ? status.lights.length : 0;
    const relayCount = Array.isArray(status.relays) ? status.relays.length : 0;
    if (lightCount > 0) return { gen, kind: "LIGHT", outputs: lightCount };
    return { gen, kind: "SWITCH", outputs: Math.max(1, relayCount) };
  }

  // Shelly.GetStatus (no params) returns the device's full status object, with one
  // "switch:N" or "light:N" key per output — counting them tells us the output count
  // without guessing or probing each id individually.
  try {
    const full = await rpc(ip, port, "Shelly.GetStatus");
    const switchCount = Object.keys(full).filter((k) => /^switch:\d+$/.test(k)).length;
    const lightCount = Object.keys(full).filter((k) => /^light:\d+$/.test(k)).length;
    if (lightCount > 0) return { gen, kind: "LIGHT", outputs: lightCount };
    if (switchCount > 0) return { gen, kind: "SWITCH", outputs: switchCount };
  } catch {
    // fall through to the single-channel probe below
  }

  try {
    await rpc(ip, port, "Switch.GetStatus", { id: 0 });
    return { gen, kind: "SWITCH", outputs: 1 };
  } catch {
    await rpc(ip, port, "Light.GetStatus", { id: 0 });
    return { gen, kind: "LIGHT", outputs: 1 };
  }
}

export interface ShellyStatus {
  on: boolean;
  brightness: number | null;
  powerW: number | null;
}

export async function getShellyStatus(
  ip: string,
  port: number | null | undefined,
  gen: number,
  kind: ShellyKind,
  channel: number
): Promise<ShellyStatus> {
  if (gen === 1) {
    const data = await gen1(ip, port, "/status");
    const meters = data.meters ?? [];
    const powerW = typeof meters[channel]?.power === "number" ? meters[channel].power : null;
    if (kind === "LIGHT") {
      const light = data.lights?.[channel] ?? {};
      return { on: Boolean(light.ison), brightness: light.brightness ?? null, powerW };
    }
    const relay = data.relays?.[channel] ?? {};
    return { on: Boolean(relay.ison), brightness: null, powerW };
  }

  const method = kind === "LIGHT" ? "Light.GetStatus" : "Switch.GetStatus";
  const result = await rpc(ip, port, method, { id: channel });
  return {
    on: Boolean(result.output),
    brightness: typeof result.brightness === "number" ? result.brightness : null,
    powerW: typeof result.apower === "number" ? result.apower : null,
  };
}

export async function setShellyPower(
  ip: string,
  port: number | null | undefined,
  gen: number,
  kind: ShellyKind,
  channel: number,
  on: boolean
): Promise<void> {
  if (gen === 1) {
    const path = kind === "LIGHT" ? `/light/${channel}` : `/relay/${channel}`;
    await gen1(ip, port, path, { turn: on ? "on" : "off" });
    return;
  }
  const method = kind === "LIGHT" ? "Light.Set" : "Switch.Set";
  await rpc(ip, port, method, { id: channel, on });
}

/** Setting a brightness implicitly turns the light on, matching how the physical
 * Shelly app/UI behaves — dragging the slider above 0% always makes the light come on. */
export async function setShellyBrightness(
  ip: string,
  port: number | null | undefined,
  gen: number,
  kind: ShellyKind,
  channel: number,
  brightness: number
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(brightness)));
  if (gen === 1) {
    await gen1(ip, port, `/light/${channel}`, { turn: "on", brightness: String(clamped) });
    return;
  }
  await rpc(ip, port, "Light.Set", { id: channel, on: true, brightness: clamped });
}
