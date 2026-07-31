import { prisma } from "../../config/prisma";
import { mapLimit } from "../../lib/concurrency";
import { expandRange } from "../../lib/ipRange";
import { getArpMac, getNetbiosName, pingHost, reverseDns, scanCommonPorts } from "../../lib/ping";
import { guessDeviceType, lookupVendor, lookupVendorOnline } from "../../lib/macVendor";

const MAX_HOSTS_PER_SCAN = 1024;
const SCAN_CONCURRENCY = 24;

export function validateRange(startIp: string, endIp: string) {
  return expandRange(startIp, endIp, MAX_HOSTS_PER_SCAN);
}

export async function startScan(startIp: string, endIp: string, userId: number) {
  const addresses = validateRange(startIp, endIp);

  const scan = await prisma.networkScan.create({
    data: { startIp, endIp, totalHosts: addresses.length, startedById: userId },
  });

  runScan(scan.id, addresses).catch(async () => {
    await prisma.networkScan.update({ where: { id: scan.id }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => undefined);
  });

  return scan;
}

// Resolves a scanned IP's hostname through three fallbacks, in order of cost/reliability:
// 1. Reverse DNS — fast and authoritative when PTR records exist, but most LANs don't have them.
// 2. The Kynren agent's own device check-ins — free (already in memory) and exact for any
//    machine running the agent, agent-installed or not.
// 3. An active NetBIOS Name Service query — the ~600ms fallback of last resort, but it's what
//    actually resolves the bulk of un-agented Windows/NAS/embedded hosts on a typical LAN, which
//    is the majority of what a subnet sweep finds.
async function resolveHostname(ip: string, deviceHostnameByIp: Map<string, string>): Promise<string | null> {
  const viaDns = await reverseDns(ip);
  if (viaDns) return viaDns;

  const viaAgent = deviceHostnameByIp.get(ip);
  if (viaAgent) return viaAgent;

  return getNetbiosName(ip);
}

async function runScan(scanId: number, addresses: string[]) {
  let aliveCount = 0;
  let scannedCount = 0;

  const devices = await prisma.device.findMany({ select: { hostname: true, ipAddresses: true } });
  const deviceHostnameByIp = new Map<string, string>();
  for (const device of devices) {
    for (const ip of device.ipAddresses) deviceHostnameByIp.set(ip, device.hostname);
  }

  await mapLimit(addresses, SCAN_CONCURRENCY, async (ip) => {
    const ping = await pingHost(ip);

    let hostname: string | null = null;
    let mac: string | null = null;
    let openPorts: number[] = [];

    let vendor: string | null = null;
    let deviceType: string | null = null;

    if (ping.alive) {
      [hostname, mac, openPorts] = await Promise.all([resolveHostname(ip, deviceHostnameByIp), getArpMac(ip), scanCommonPorts(ip)]);
      vendor = lookupVendor(mac) ?? (await lookupVendorOnline(mac));
      deviceType = guessDeviceType(vendor, openPorts);
      aliveCount += 1;
    }

    scannedCount += 1;

    await prisma.networkScanResult.create({
      data: {
        scanId,
        ipAddress: ip,
        alive: ping.alive,
        hostname,
        macAddress: mac,
        vendor,
        deviceType,
        responseTimeMs: ping.responseTimeMs,
        openPorts,
      },
    });

    await prisma.networkScan.update({
      where: { id: scanId },
      data: { aliveHosts: aliveCount, scannedHosts: scannedCount },
    });
  });

  await prisma.networkScan.update({
    where: { id: scanId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}
