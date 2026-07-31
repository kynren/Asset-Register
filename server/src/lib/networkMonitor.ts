import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { mapLimit } from "./concurrency";
import { runScheduledScan, enqueueRelayScan, isNetworkRelayEnabled } from "../modules/network/scan.service";
import { ipToLong } from "./ipRange";
import { pollDevice } from "./snmp";
import { decryptSecret } from "./crypto";
import { notifyUsers, getUserIdsWithPermission } from "./notify";

interface MonitorRange {
  startIp: string;
  endIp: string;
  label?: string;
}

interface AliveHost {
  ipAddress: string;
  macAddress: string | null;
  hostname: string | null;
  vendor: string | null;
  deviceType: string | null;
  loggedInUser: string | null;
}

function deviceKey(mac: string | null, ip: string): string {
  return mac ? mac.toUpperCase() : `ip:${ip}`;
}

function formatSince(d: Date): string {
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function notifyStatusChange(device: { hostname: string | null; ipAddress: string; deviceType: string | null }, status: "OFFLINE" | "ONLINE", changedAt: Date) {
  const userIds = await getUserIdsWithPermission("network", "canEdit");
  if (userIds.length === 0) return;

  const deviceName = device.hostname ? `${device.hostname} (${device.ipAddress})` : device.ipAddress;
  const monitorUrl = `${env.CLIENT_ORIGIN}/network`;
  const message = status === "OFFLINE" ? `${deviceName} went offline.` : `${deviceName} is back online.`;

  await notifyUsers({
    userIds,
    type: status === "OFFLINE" ? "device_offline" : "device_online",
    message,
    linkUrl: "/network",
    email: {
      eventType: status === "OFFLINE" ? "DEVICE_OFFLINE" : "DEVICE_ONLINE",
      fallbackSubject: status === "OFFLINE" ? `Device offline: ${deviceName}` : `Device back online: ${deviceName}`,
      fallbackText: `${message}\n\nView network monitoring: ${monitorUrl}`,
      variables: {
        deviceName,
        ipAddress: device.ipAddress,
        deviceType: device.deviceType ?? "Unclassified Device",
        sinceTime: formatSince(changedAt),
        monitorUrl,
      },
    },
  });
}

// Direct-mode SNMP polling only — the server does its own UDP polling here, which requires the
// same LAN route as scanning. In relay mode the relay agent polls SNMP itself and submits results
// alongside the scan (see relay.routes.ts), so this function is never called for relay scans.
async function pollSnmpForAliveDevices(aliveKeys: Set<string>) {
  const candidates = await prisma.monitoredNetworkDevice.findMany({
    where: { snmpEnabled: true, snmpCommunity: { not: null } },
  });
  const toPoll = candidates.filter((d) => aliveKeys.has(d.key));

  await mapLimit(toPoll, 5, async (device) => {
    try {
      const community = decryptSecret(device.snmpCommunity!);
      const result = await pollDevice(device.ipAddress, community, device.snmpPort);
      if (!result.data) {
        await prisma.monitoredNetworkDevice.update({
          where: { id: device.id },
          data: { snmpLastError: result.error, snmpLastPolledAt: new Date() },
        });
        return;
      }
      await prisma.monitoredNetworkDevice.update({
        where: { id: device.id },
        data: {
          snmpSysDescr: result.data.sysDescr,
          snmpUpTimeTicks: result.data.upTimeTicks != null ? BigInt(result.data.upTimeTicks) : null,
          snmpInterfaces: result.data.interfaces as unknown as object,
          snmpLastPolledAt: new Date(),
          snmpLastError: null,
        },
      });
    } catch (err) {
      await prisma.monitoredNetworkDevice.update({
        where: { id: device.id },
        data: { snmpLastError: (err as Error).message, snmpLastPolledAt: new Date() },
      }).catch(() => undefined);
    }
  });
}

export interface MonitorCycleSummary {
  rangesScanned: number;
  rangesQueuedForRelay: number;
  hostsAlive: number;
  wentOffline: number;
  cameOnline: number;
}

/**
 * Diffs one completed scan's alive hosts against MonitoredNetworkDevice's current state — status
 * transitions only (not every cycle) get logged as a NetworkDeviceStatusEvent and alerted on.
 * Scoped to devices whose IP falls within *this scan's* range (not globally) so relay scans that
 * complete asynchronously and out of order across multiple configured ranges can't wrongly mark a
 * device from a different, still-pending range as offline.
 *
 * Called both right after a direct-mode scheduled scan finishes, and from relay.routes.ts when a
 * relay-executed scheduled scan reports its results back.
 */
export async function processCompletedMonitorScan(scanId: number, options: { skipSnmp?: boolean } = {}): Promise<{ hostsAlive: number; wentOffline: number; cameOnline: number }> {
  const scan = await prisma.networkScan.findUnique({ where: { id: scanId }, include: { results: true } });
  if (!scan) return { hostsAlive: 0, wentOffline: 0, cameOnline: 0 };

  const alive: AliveHost[] = scan.results
    .filter((r) => r.alive)
    .map((r) => ({ ipAddress: r.ipAddress, macAddress: r.macAddress, hostname: r.hostname, vendor: r.vendor, deviceType: r.deviceType, loggedInUser: r.loggedInUser }));

  const now = new Date();
  const aliveKeys = new Set(alive.map((h) => deviceKey(h.macAddress, h.ipAddress)));
  let wentOffline = 0;
  let cameOnline = 0;

  for (const host of alive) {
    const key = deviceKey(host.macAddress, host.ipAddress);
    const existing = await prisma.monitoredNetworkDevice.findUnique({ where: { key } });

    if (!existing) {
      const created = await prisma.monitoredNetworkDevice.create({
        data: {
          key,
          ipAddress: host.ipAddress,
          macAddress: host.macAddress,
          hostname: host.hostname,
          vendor: host.vendor,
          deviceType: host.deviceType,
          loggedInUser: host.loggedInUser,
          status: "ONLINE",
        },
      });
      await prisma.networkDeviceStatusEvent.create({ data: { deviceId: created.id, status: "ONLINE" } });
      continue;
    }

    const wasOffline = existing.status === "OFFLINE";
    await prisma.monitoredNetworkDevice.update({
      where: { id: existing.id },
      data: {
        ipAddress: host.ipAddress,
        hostname: host.hostname ?? existing.hostname,
        vendor: host.vendor ?? existing.vendor,
        deviceType: host.deviceType ?? existing.deviceType,
        loggedInUser: host.loggedInUser ?? existing.loggedInUser,
        status: "ONLINE",
        lastSeenAt: now,
        lastChangedAt: wasOffline ? now : existing.lastChangedAt,
      },
    });

    if (wasOffline) {
      cameOnline += 1;
      await prisma.networkDeviceStatusEvent.create({ data: { deviceId: existing.id, status: "ONLINE" } });
      await notifyStatusChange({ hostname: host.hostname, ipAddress: host.ipAddress, deviceType: host.deviceType }, "ONLINE", now);
    }
  }

  const rangeStart = ipToLong(scan.startIp);
  const rangeEnd = ipToLong(scan.endIp);
  const onlineDevices = await prisma.monitoredNetworkDevice.findMany({ where: { status: "ONLINE" } });
  const missing = onlineDevices.filter((d) => {
    if (aliveKeys.has(d.key)) return false;
    const ipValue = ipToLong(d.ipAddress);
    return ipValue >= rangeStart && ipValue <= rangeEnd;
  });

  for (const device of missing) {
    await prisma.monitoredNetworkDevice.update({ where: { id: device.id }, data: { status: "OFFLINE", lastChangedAt: now } });
    await prisma.networkDeviceStatusEvent.create({ data: { deviceId: device.id, status: "OFFLINE" } });
    wentOffline += 1;
    await notifyStatusChange({ hostname: device.hostname, ipAddress: device.ipAddress, deviceType: device.deviceType }, "OFFLINE", now);
  }

  if (!options.skipSnmp) {
    await pollSnmpForAliveDevices(aliveKeys);
  }

  return { hostsAlive: alive.length, wentOffline, cameOnline };
}

/**
 * One Domotz-style monitoring pass across every configured range. In direct mode this runs the
 * scan and diffs it synchronously; in relay mode (System Settings → Network Relay Agent, needed
 * whenever the server has no route into the LAN being monitored) it just enqueues a scan per
 * range and returns — the diff happens later, in relay.routes.ts, once the relay agent reports
 * that scan's results back.
 */
export async function runNetworkMonitorCycle(): Promise<MonitorCycleSummary | null> {
  const settings = await prisma.networkMonitorSettings.findUnique({ where: { id: 1 } });
  if (!settings) return null;

  const ranges = (settings.ranges as unknown as MonitorRange[]) ?? [];
  if (ranges.length === 0) {
    await prisma.networkMonitorSettings.update({ where: { id: 1 }, data: { lastRunAt: new Date() } });
    return { rangesScanned: 0, rangesQueuedForRelay: 0, hostsAlive: 0, wentOffline: 0, cameOnline: 0 };
  }

  const relay = await isNetworkRelayEnabled();
  const summary: MonitorCycleSummary = { rangesScanned: 0, rangesQueuedForRelay: 0, hostsAlive: 0, wentOffline: 0, cameOnline: 0 };

  for (const range of ranges) {
    if (relay) {
      await enqueueRelayScan(range.startIp, range.endIp, null, "SCHEDULED");
      summary.rangesQueuedForRelay += 1;
      continue;
    }

    const { id } = await runScheduledScan(range.startIp, range.endIp);
    const result = await processCompletedMonitorScan(id);
    summary.rangesScanned += 1;
    summary.hostsAlive += result.hostsAlive;
    summary.cameOnline += result.cameOnline;
    summary.wentOffline += result.wentOffline;
  }

  await prisma.networkMonitorSettings.update({ where: { id: 1 }, data: { lastRunAt: new Date() } });
  return summary;
}

let intervalHandle: NodeJS.Timeout | null = null;

// Ticks every minute but only actually runs a cycle once settings.intervalMinutes has elapsed
// since lastRunAt — unlike the other setInterval-based schedulers in this codebase (fixed hours,
// baked in at server start), the interval here is admin-configurable at runtime via the
// Monitoring tab, so it has to be re-checked against the DB on every tick rather than baked into
// the setInterval call itself.
export function startNetworkMonitorScheduler() {
  if (intervalHandle) return;
  const tick = async () => {
    try {
      const settings = await prisma.networkMonitorSettings.findUnique({ where: { id: 1 } });
      if (!settings?.enabled) return;
      const dueAt = settings.lastRunAt ? new Date(settings.lastRunAt.getTime() + settings.intervalMinutes * 60_000) : new Date(0);
      if (new Date() < dueAt) return;
      await runNetworkMonitorCycle();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Network monitor cycle failed:", err);
    }
  };
  tick();
  intervalHandle = setInterval(tick, 60_000);
  intervalHandle.unref();
}
