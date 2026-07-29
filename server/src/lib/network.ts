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

/** This machine's real network-interface IPv4 address (the NIC actually carrying traffic), not loopback. */
export function getLocalNicIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1"]);

/**
 * Normalizes the observed connection IP, then — when the connection is a loopback (client and
 * server running on the same machine, as in local dev) — substitutes that machine's real NIC
 * IP address instead. 127.0.0.1 is never useful to show or store: every machine's loopback is
 * identical, so it can't identify which device actually connected.
 */
export function resolveClientIp(ip: string | null | undefined): string | null {
  const normalized = normalizeIp(ip);
  if (normalized && LOOPBACK_IPS.has(normalized)) {
    return getLocalNicIp() ?? normalized;
  }
  return normalized;
}
