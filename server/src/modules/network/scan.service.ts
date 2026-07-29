import { prisma } from "../../config/prisma";
import { mapLimit } from "../../lib/concurrency";
import { expandRange } from "../../lib/ipRange";
import { getArpMac, pingHost, reverseDns, scanCommonPorts } from "../../lib/ping";
import { guessDeviceType, lookupVendor } from "../../lib/macVendor";

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

async function runScan(scanId: number, addresses: string[]) {
  let aliveCount = 0;
  let scannedCount = 0;

  await mapLimit(addresses, SCAN_CONCURRENCY, async (ip) => {
    const ping = await pingHost(ip);

    let hostname: string | null = null;
    let mac: string | null = null;
    let openPorts: number[] = [];

    let vendor: string | null = null;
    let deviceType: string | null = null;

    if (ping.alive) {
      [hostname, mac, openPorts] = await Promise.all([reverseDns(ip), getArpMac(ip), scanCommonPorts(ip)]);
      vendor = lookupVendor(mac);
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
