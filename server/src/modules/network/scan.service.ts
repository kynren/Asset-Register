import { prisma } from "../../config/prisma";
import { mapLimit } from "../../lib/concurrency";
import { expandRange } from "../../lib/ipRange";
import { getArpMac, getNetbiosName, pingHost, reverseDns, scanCommonPorts } from "../../lib/ping";
import { guessDeviceType, lookupVendor, lookupVendorOnline } from "../../lib/macVendor";
import { logAudit } from "../../lib/auditLogger";

const MAX_HOSTS_PER_SCAN = 1024;
const SCAN_CONCURRENCY = 24;

export function validateRange(startIp: string, endIp: string) {
  return expandRange(startIp, endIp, MAX_HOSTS_PER_SCAN);
}

export async function startScan(startIp: string, endIp: string, userId: number | null, triggeredBy: "MANUAL" | "SCHEDULED" = "MANUAL") {
  const addresses = validateRange(startIp, endIp);

  const scan = await prisma.networkScan.create({
    data: { startIp, endIp, totalHosts: addresses.length, startedById: userId, triggeredBy },
  });

  runScan(scan.id, addresses).catch(async () => {
    await prisma.networkScan.update({ where: { id: scan.id }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => undefined);
  });

  return scan;
}

// Used by the continuous network monitor (server/src/lib/networkMonitor.ts) — unlike startScan()
// above (fire-and-forget, returns immediately with status RUNNING for the UI to poll), this
// awaits the full scan synchronously since the monitor already runs off the request/response
// cycle and needs the finished results to diff against known device state.
export async function runScheduledScan(startIp: string, endIp: string): Promise<{ id: number; results: Awaited<ReturnType<typeof prisma.networkScanResult.findMany>> }> {
  const addresses = validateRange(startIp, endIp);

  const scan = await prisma.networkScan.create({
    data: { startIp, endIp, totalHosts: addresses.length, startedById: null, triggeredBy: "SCHEDULED" },
  });

  try {
    await runScan(scan.id, addresses);
  } catch {
    await prisma.networkScan.update({ where: { id: scan.id }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => undefined);
  }

  const results = await prisma.networkScanResult.findMany({ where: { scanId: scan.id } });
  return { id: scan.id, results };
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

// If a scanned host's resolved hostname matches an existing asset's name or asset tag (real IT
// estates commonly name machines after one or the other — see pingAsset()'s comment), and that
// asset has no static IP recorded yet and isn't already linked to a Device (which would carry its
// own MAC/IP info), fill in the discovered IP. Best-effort and silent on no match — most scanned
// hosts won't correspond to any inventory asset.
async function fillAssetIpFromHostname(hostname: string, ip: string, scanId: number) {
  const updated = await prisma.asset.updateMany({
    where: {
      staticIpAddress: null,
      deviceId: null,
      OR: [{ name: { equals: hostname, mode: "insensitive" } }, { assetTag: { equals: hostname, mode: "insensitive" } }],
    },
    data: { staticIpAddress: ip },
  });
  if (updated.count > 0) {
    await logAudit({ action: "asset.auto_fill_ip_from_scan", entityType: "NetworkScan", entityId: scanId, metadata: { hostname, ip, assetsUpdated: updated.count } });
  }
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
      if (hostname) await fillAssetIpFromHostname(hostname, ip, scanId).catch(() => undefined);
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
