/**
 * Local network client for Tasmota-flashed devices — the other dominant open-source
 * firmware (alongside stock Shelly firmware) that turns commodity ESP8266/ESP32 relays and
 * dimmers into locally-controllable smart switches/lights, no cloud account involved.
 *
 * Tasmota's local API is one flat HTTP surface: every command is a GET to
 *   http://<ip>/cm?cmnd=<command>[%20<args>]
 * returning a small JSON object. Channels are 1-indexed (`Power1`, `Power2`, ...) — unlike
 * Shelly's 0-indexed `id` — so callers pass a 0-indexed `channel` here and this module adds 1.
 *
 * IMPORTANT: like the AccessControl module's Hikvision calls, this is implemented directly
 * from Tasmota's published HTTP API documentation, not verified against physical hardware in
 * this codebase. The shapes below (POWER/Dimmer response keys, Status 0 device-identification
 * fields) are standard across Tasmota versions, but if a call fails against a real device,
 * check that device's own Console (Tasmota's web UI) for the exact command echoed back before
 * assuming the code is wrong. Also note: devices with a Tasmota web admin password set need
 * `&user=admin&password=...` appended to every request — not implemented here, matching this
 * module's scope (unauthenticated local API only, same as the Shelly driver).
 */

const TIMEOUT_MS = 4000;

export class TasmotaError extends Error {}

function connectionErrorMessage(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  if (e?.name === "AbortError") return "Connection timed out.";
  const code = e?.code ?? e?.cause?.code;
  if (code === "ECONNREFUSED") return "Connection refused — nothing is listening on that host/port.";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return "Host unreachable.";
  return e?.message ?? "Unknown network error.";
}

async function cmnd(ip: string, port: number | null | undefined, command: string): Promise<any> {
  const url = `http://${ip}:${port ?? 80}/cm?cmnd=${encodeURIComponent(command)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new TasmotaError(`Device responded with HTTP ${res.status}.`);
    return await res.json().catch(() => ({}) as any);
  } catch (err) {
    if (err instanceof TasmotaError) throw err;
    throw new TasmotaError(connectionErrorMessage(err));
  } finally {
    clearTimeout(timeout);
  }
}

export interface TasmotaDetection {
  kind: "SWITCH" | "LIGHT";
}

/** `Status 0` returns full device status; a well-formed `Status` object with a device name is
 * this module's confirmation signal that the host is actually running Tasmota. Whether the
 * channel is dimmable is then determined the same way shellyApi.ts does it — try the
 * light-specific command (`Dimmer`) and fall back to treating it as a plain switch. */
export async function detectTasmota(ip: string, port: number | null | undefined): Promise<TasmotaDetection> {
  const status = await cmnd(ip, port, "Status 0");
  if (!status?.Status) throw new TasmotaError("Not a recognizable Tasmota device.");

  const dimmer = await cmnd(ip, port, "Dimmer").catch(() => null);
  const kind: TasmotaDetection["kind"] = dimmer && typeof dimmer.Dimmer === "number" ? "LIGHT" : "SWITCH";
  return { kind };
}

export interface TasmotaStatus {
  on: boolean;
  brightness: number | null;
}

function powerKey(channel: number): string {
  return `POWER${channel + 1}`;
}

export async function getTasmotaStatus(ip: string, port: number | null | undefined, kind: "SWITCH" | "LIGHT", channel: number): Promise<TasmotaStatus> {
  const power = await cmnd(ip, port, "Power");
  // Single-relay devices reply {"POWER":"ON"}; multi-relay devices reply {"POWER1":"ON","POWER2":"OFF",...}.
  const raw = power[powerKey(channel)] ?? power.POWER;
  const on = String(raw).toUpperCase() === "ON";

  let brightness: number | null = null;
  if (kind === "LIGHT") {
    const dimmer = await cmnd(ip, port, "Dimmer").catch(() => null);
    brightness = typeof dimmer?.Dimmer === "number" ? dimmer.Dimmer : null;
  }
  return { on, brightness };
}

export async function setTasmotaPower(ip: string, port: number | null | undefined, channel: number, on: boolean): Promise<void> {
  await cmnd(ip, port, `${powerKey(channel)} ${on ? "On" : "Off"}`);
}

/** Setting brightness implicitly turns the light on (Tasmota's own behavior — sending
 * `Dimmer 0` turns the light off instead, so brightness is clamped to at least 1 here to
 * match the "slide above 0% = on" convention used consistently across this module). */
export async function setTasmotaBrightness(ip: string, port: number | null | undefined, brightness: number): Promise<void> {
  const clamped = Math.max(1, Math.min(100, Math.round(brightness)));
  await cmnd(ip, port, `Dimmer ${clamped}`);
}
