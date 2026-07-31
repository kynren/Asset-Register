/**
 * Fast LAN discovery for Shelly devices — used by the Lighting module's "Discover" scan.
 *
 * Unlike shellyApi.ts (which talks to a device the user already knows the IP of), this
 * probes an entire range blind: GET /shelly is the one endpoint answered identically by
 * every generation, so a short-timeout hit against it is a sufficient signal on its own —
 * no need for the slower ICMP-ping-then-port-scan approach the general network scanner
 * uses (server/src/lib/ping.ts). A host that isn't a Shelly (or isn't up at all) just
 * times out or refuses the connection, both of which resolve quickly on a LAN.
 */

const PROBE_TIMEOUT_MS = 600;

export interface ShellyProbeHit {
  ip: string;
  name: string | null;
  model: string | null;
  gen: number;
}

export async function probeShellyHost(ip: string): Promise<ShellyProbeHit | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${ip}/shelly`, { signal: controller.signal });
    if (!res.ok) return null;
    const info: any = await res.json().catch(() => null);
    // A real Shelly /shelly response always has at least one of these; anything else
    // (a random web server that happens to 200 on that path) gets filtered out here.
    if (!info || (!info.mac && !info.type && !info.model && info.gen === undefined)) return null;
    return {
      ip,
      name: typeof info.name === "string" ? info.name : null,
      model: typeof info.model === "string" ? info.model : typeof info.type === "string" ? info.type : null,
      gen: typeof info.gen === "number" ? info.gen : 1,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
