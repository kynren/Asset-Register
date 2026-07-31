/**
 * Fast LAN discovery for Tasmota-flashed devices — used alongside shellyProbe.ts by the
 * Lighting module's "Discover" scan. `cm?cmnd=Status%200` is answered by every Tasmota device
 * regardless of module type, so a short-timeout hit against it is enough to identify one blind,
 * same reasoning as shellyProbe.ts's use of GET /shelly.
 */

const PROBE_TIMEOUT_MS = 600;

export interface TasmotaProbeHit {
  ip: string;
  name: string | null;
  model: string | null;
}

export async function probeTasmotaHost(ip: string): Promise<TasmotaProbeHit | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${ip}/cm?cmnd=Status%200`, { signal: controller.signal });
    if (!res.ok) return null;
    const info: any = await res.json().catch(() => null);
    const status = info?.Status;
    if (!status) return null; // not Tasmota (or a device that happens to 200 on this path)
    const friendlyName = Array.isArray(status.FriendlyName) ? status.FriendlyName[0] : null;
    return {
      ip,
      name: typeof friendlyName === "string" ? friendlyName : null,
      model: typeof status.Module === "string" ? status.Module : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
