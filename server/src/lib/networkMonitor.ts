import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { mapLimit } from "./concurrency";
import { runScheduledScan } from "../modules/network/scan.service";
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
  hostsAlive: number;
  wentOffline: number;
  cameOnline: number;
}

/**
 * One full Domotz-style monitoring pass: re-scans every configured range, diffs the alive set
 * against MonitoredNetworkDevice's current state (flipping status + logging a
 * NetworkDeviceStatusEvent + alerting only on actual transitions, not every cycle), then SNMP-
 * polls whichever alive devices have it enabled. Safe to call directly for a manual "Run Now",
 * or via the interval-gated scheduler below.
 */
export async function runNetworkMonitorCycle(): Promise<MonitorCycleSummary | null> {
  const settings = await prisma.networkMonitorSettings.findUnique({ where: { id: 1 } });
  if (!settings) return null;

  const ranges = (settings.ranges as unknown as MonitorRange[]) ?? [];
  if (ranges.length === 0) {
    await prisma.networkMonitorSettings.update({ where: { id: 1 }, data: { lastRunAt: new Date() } });
    return { rangesScanned: 0, hostsAlive: 0, wentOffline: 0, cameOnline: 0 };
  }

  const alive: AliveHost[] = [];
  for (const range of ranges) {
    const { results } = await runScheduledScan(range.startIp, range.endIp);
    for (const r of results) {
      if (r.alive) alive.push({ ipAddress: r.ipAddress, macAddress: r.macAddress, hostname: r.hostname, vendor: r.vendor, deviceType: r.deviceType });
    }
  }

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

  const missing = await prisma.monitoredNetworkDevice.findMany({ where: { status: "ONLINE", key: { notIn: [...aliveKeys] } } });
  for (const device of missing) {
    await prisma.monitoredNetworkDevice.update({ where: { id: device.id }, data: { status: "OFFLINE", lastChangedAt: now } });
    await prisma.networkDeviceStatusEvent.create({ data: { deviceId: device.id, status: "OFFLINE" } });
    wentOffline += 1;
    await notifyStatusChange({ hostname: device.hostname, ipAddress: device.ipAddress, deviceType: device.deviceType }, "OFFLINE", now);
  }

  await pollSnmpForAliveDevices(aliveKeys);

  await prisma.networkMonitorSettings.update({ where: { id: 1 }, data: { lastRunAt: now } });

  return { rangesScanned: ranges.length, hostsAlive: alive.length, wentOffline, cameOnline };
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
