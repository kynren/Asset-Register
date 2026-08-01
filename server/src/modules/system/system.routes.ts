import os from "os";
import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { getLocalNicIp, resolveClientIp } from "../../lib/network";
import { prisma } from "../../config/prisma";
import { runSystemStatusCheck } from "../../lib/systemStatusMonitor";

const router = Router();
router.use(verifyJwt);

router.get("/info", async (_req, res) => {
  res.json({
    nodeIp: (await getLocalNicIp()) ?? "127.0.0.1",
    hostname: os.hostname(),
    platform: os.platform(),
  });
});

// Reports back what this device's own IP is — real values only (no fabricated "public IP"
// lookups). A remote server behind NAT can only ever see the shared public/router IP of an
// incoming connection, which is legitimately identical for every device on the same office
// network — it's not a bug, it's just not useful for telling machines apart. So this prefers
// the IP the Kynren agent already collected directly on whichever device the current user's
// assigned asset is linked to (agent's own routing-table read of its real NIC — see
// agent/kynren_agent.py get_primary_ip()), and only falls back to the connection-observed IP
// (with the loopback-substitution behavior below) when no such device is linked.
router.get("/client-info", async (req, res) => {
  const ownedAssets = await prisma.asset.findMany({
    where: { assignedToId: req.user!.id, deviceId: { not: null } },
    select: { device: { select: { ipAddresses: true, hostname: true, lastSeen: true } } },
  });
  const agentDevice = ownedAssets
    .map((a) => a.device)
    .filter((d): d is NonNullable<typeof d> => !!d && d.ipAddresses.length > 0)
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())[0];

  if (agentDevice) {
    res.json({
      observedIp: agentDevice.ipAddresses[0],
      source: "agent",
      deviceHostname: agentDevice.hostname,
      deviceLastSeen: agentDevice.lastSeen,
      appVersion: "1.0.0",
      serverTime: new Date().toISOString(),
    });
    return;
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const rawIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0].trim()) || req.socket.remoteAddress || req.ip;

  res.json({
    observedIp: (await resolveClientIp(rawIp)) ?? "unknown",
    source: "connection",
    protocol: req.protocol,
    host: req.get("host"),
    appVersion: "1.0.0",
    serverTime: new Date().toISOString(),
  });
});

const STATUS_HISTORY_DAYS = 90;

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Powers the Admin & Setup "System Status" tab — styled after status.claude.com: an overall
// banner plus, per component, a 90-day strip of daily status bars and an uptime percentage.
// `currentStatus`/`days[].status` are null wherever no health check has run yet for that day
// (e.g. every day before this feature was deployed) — the frontend renders those as neutral
// "no data" bars rather than fabricating a status.
router.get("/status", requirePermission("admin", "view"), async (_req, res) => {
  const today = startOfUtcDay(new Date());
  const rangeStart = new Date(today);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (STATUS_HISTORY_DAYS - 1));

  const [components, dailyStatuses] = await Promise.all([
    prisma.systemComponent.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.systemComponentDailyStatus.findMany({ where: { date: { gte: rangeStart } } }),
  ]);

  const byComponent = new Map<number, Map<string, (typeof dailyStatuses)[number]>>();
  for (const s of dailyStatuses) {
    if (!byComponent.has(s.componentId)) byComponent.set(s.componentId, new Map());
    byComponent.get(s.componentId)!.set(toDateKey(s.date), s);
  }

  const todayKey = toDateKey(today);
  const result = components.map((c) => {
    const dayMap = byComponent.get(c.id) ?? new Map();
    const days: { date: string; status: string | null }[] = [];
    let checksOkSum = 0;
    let checksTotalSum = 0;
    for (let i = 0; i < STATUS_HISTORY_DAYS; i++) {
      const d = new Date(rangeStart);
      d.setUTCDate(d.getUTCDate() + i);
      const key = toDateKey(d);
      const row = dayMap.get(key);
      days.push({ date: key, status: row?.status ?? null });
      if (row) {
        checksOkSum += row.checksOk;
        checksTotalSum += row.checksTotal;
      }
    }
    const todayRow = dayMap.get(todayKey);
    return {
      key: c.key,
      name: c.name,
      currentStatus: todayRow?.status ?? null,
      currentMessage: todayRow?.lastMessage ?? null,
      uptimePercent: checksTotalSum > 0 ? Math.round((checksOkSum / checksTotalSum) * 10000) / 100 : null,
      days,
    };
  });

  const overall = result.some((r) => r.currentStatus === "OUTAGE")
    ? "OUTAGE"
    : result.some((r) => r.currentStatus === "DEGRADED")
      ? "DEGRADED"
      : result.some((r) => r.currentStatus === null)
        ? "UNKNOWN"
        : "OPERATIONAL";

  res.json({ overall, components: result });
});

// Lets an admin force an immediate health check instead of waiting for the next 5-minute cycle —
// useful right after fixing something (e.g. configuring SMTP) to confirm it actually took effect.
router.post("/status/check-now", requirePermission("admin", "view"), async (_req, res) => {
  await runSystemStatusCheck();
  res.json({ ok: true });
});

export default router;
