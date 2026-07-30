import dgram from "dgram";
import os from "os";

export function subnetOf(ip: string | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

export function isOnline(lastSeen: Date, thresholdMinutes = 15): boolean {
  return Date.now() - new Date(lastSeen).getTime() < thresholdMinutes * 60 * 1000;
}

/** Normalizes IPv6 loopback/IPv4-mapped forms to a recognizable plain IPv4 address. */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  let normalized = ip.replace("::ffff:", "");
  if (normalized === "::1") normalized = "127.0.0.1";
  return normalized;
}

function isLinkLocal(ip: string): boolean {
  return ip.startsWith("169.254.");
}

/**
 * Asks the OS routing table which local interface it would use to reach the internet — no packet
 * is actually sent, a UDP socket's connect() just resolves the route. Mirrors the same trick used
 * by the Python device agent (agent/kynren_agent.py get_primary_ip()): a machine with several
 * IPv4 addresses (Docker/Hyper-V/WSL/VPN virtual adapters alongside the real NIC) has no other
 * reliable way to tell which one is "the real" one, since os.networkInterfaces() iteration order
 * carries no such meaning.
 */
function getPrimaryIp(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(result);
    };
    socket.on("error", () => finish(null));
    socket.connect(80, "8.8.8.8", () => {
      try {
        finish(socket.address().address);
      } catch {
        finish(null);
      }
    });
  });
}

/**
 * This machine's real network-interface IPv4 address (the NIC actually carrying traffic), not
 * loopback. Prefers the OS-routing-table answer; falls back to scanning interfaces (skipping
 * link-local 169.254.x.x addresses, which come from an adapter that never got a real DHCP lease
 * and can't identify a specific device) if that fails.
 */
export async function getLocalNicIp(): Promise<string | null> {
  const primary = await getPrimaryIp();
  if (primary && !isLinkLocal(primary)) return primary;

  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal && !isLinkLocal(iface.address)) {
        return iface.address;
      }
    }
  }
  return primary ?? null;
}

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1"]);

/**
 * Normalizes the observed connection IP, then — when the connection is a loopback (client and
 * server running on the same machine, as in local dev) — substitutes that machine's real NIC
 * IP address instead. 127.0.0.1 is never useful to show or store: every machine's loopback is
 * identical, so it can't identify which device actually connected.
 */
export async function resolveClientIp(ip: string | null | undefined): Promise<string | null> {
  const normalized = normalizeIp(ip);
  if (normalized && LOOPBACK_IPS.has(normalized)) {
    return (await getLocalNicIp()) ?? normalized;
  }
  return normalized;
}
