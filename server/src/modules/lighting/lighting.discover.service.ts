import { prisma } from "../../config/prisma";
import { expandRange } from "../../lib/ipRange";
import { mapLimit } from "../../lib/concurrency";
import { probeShellyHost } from "../../lib/shellyProbe";
import { probeTasmotaHost } from "../../lib/tasmotaProbe";

// Same shape of limits as the general Network Topology Map scanner
// (server/src/modules/network/scan.service.ts) — higher concurrency is safe here since each
// probe is a single short-timeout HTTP request, not ICMP + a multi-port TCP sweep per host.
const DISCOVER_CONCURRENCY = 40;
const MAX_HOSTS_PER_DISCOVER = 1024;

export function validateDiscoverRange(startIp: string, endIp: string): string[] {
  return expandRange(startIp, endIp, MAX_HOSTS_PER_DISCOVER);
}

/** Starts a scan in the background and returns immediately — the caller (route handler)
 * responds with the initial (RUNNING) scan row right away; the client polls for progress. */
export async function startLightingDiscovery(startIp: string, endIp: string) {
  const addresses = validateDiscoverRange(startIp, endIp);
  const scan = await prisma.lightingScan.create({
    data: { startIp, endIp, totalHosts: addresses.length, status: "RUNNING" },
  });

  runDiscovery(scan.id, addresses).catch(() =>
    prisma.lightingScan.update({ where: { id: scan.id }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => undefined)
  );

  return scan;
}

async function runDiscovery(scanId: number, addresses: string[]): Promise<void> {
  const alreadySaved = new Set((await prisma.lightingDevice.findMany({ select: { ipAddress: true } })).map((d) => d.ipAddress));

  let scanned = 0;
  await mapLimit(addresses, DISCOVER_CONCURRENCY, async (ip) => {
    // Try Shelly first (its `/shelly` endpoint is the cheaper/more common signal in this
    // deployment base), falling back to Tasmota's `cm?cmnd=Status 0` only when that misses —
    // a host is never both, so this stays one extra request at worst per non-Shelly IP.
    const shellyHit = await probeShellyHost(ip);
    if (shellyHit) {
      await prisma.lightingScanResult.create({
        data: {
          scanId,
          protocol: "SHELLY",
          ipAddress: shellyHit.ip,
          name: shellyHit.name,
          model: shellyHit.model,
          gen: shellyHit.gen,
          alreadyAdded: alreadySaved.has(shellyHit.ip),
        },
      });
    } else {
      const tasmotaHit = await probeTasmotaHost(ip);
      if (tasmotaHit) {
        await prisma.lightingScanResult.create({
          data: {
            scanId,
            protocol: "TASMOTA",
            ipAddress: tasmotaHit.ip,
            name: tasmotaHit.name,
            model: tasmotaHit.model,
            gen: null,
            alreadyAdded: alreadySaved.has(tasmotaHit.ip),
          },
        });
      }
    }
    scanned++;
    await prisma.lightingScan.update({ where: { id: scanId }, data: { scannedHosts: scanned } });
  });

  await prisma.lightingScan.update({ where: { id: scanId }, data: { status: "COMPLETED", completedAt: new Date() } });
}
