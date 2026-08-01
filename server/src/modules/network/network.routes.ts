import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { isOnline } from "../../lib/network";
import { pingHost } from "../../lib/ping";
import { streamPing } from "../../lib/pingStream";
import { encryptSecret } from "../../lib/crypto";
import { runNetworkMonitorCycle } from "../../lib/networkMonitor";
import { createEdgeSchema, createNodeSchema, updateMonitorSettingsSchema, updateNodeSchema, updateSnmpConfigSchema } from "./network.schema";
import { startScan } from "./scan.service";

const router = Router();
router.use(verifyJwt);

router.get("/graph", requirePermission("network", "view"), async (_req, res) => {
  const [nodes, edges] = await Promise.all([
    prisma.networkNode.findMany({ include: { device: true } }),
    prisma.networkEdge.findMany(),
  ]);

  // Live-classify each node's status from a real ICMP probe of its IP (falling back to the
  // linked device's most recently reported address), not a fabricated/static value.
  const liveStatuses = await Promise.all(
    nodes.map(async (n) => {
      const ip = n.ipAddress ?? n.device?.ipAddresses?.[0] ?? null;
      if (!ip) return { latencyMs: null as number | null, status: null as "ONLINE" | "DEGRADED" | "OFFLINE" | null };
      const { alive, responseTimeMs } = await pingHost(ip, 800);
      if (!alive) return { latencyMs: null, status: "OFFLINE" as const };
      return { latencyMs: responseTimeMs, status: (responseTimeMs !== null && responseTimeMs > 50 ? "DEGRADED" : "ONLINE") as "DEGRADED" | "ONLINE" };
    })
  );

  const shapedNodes = nodes.map((n, i) => ({
    id: n.id,
    type: n.type,
    role: n.role,
    label: n.label,
    ipAddress: n.ipAddress,
    subnet: n.subnet,
    vendor: n.vendor,
    deviceType: n.deviceType,
    posX: n.posX,
    posY: n.posY,
    deviceId: n.deviceId,
    online: n.device ? isOnline(n.device.lastSeen) : null,
    lastSeen: n.device?.lastSeen ?? null,
    latencyMs: liveStatuses[i].latencyMs,
    liveStatus: liveStatuses[i].status,
  }));

  res.json({ nodes: shapedNodes, edges });
});

router.post("/nodes", requirePermission("network", "create"), validateBody(createNodeSchema), async (req, res) => {
  const node = await prisma.networkNode.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "networkNode.create", entityType: "NetworkNode", entityId: node.id });
  res.status(201).json(node);
});

router.patch("/nodes/:id", requirePermission("network", "edit"), validateBody(updateNodeSchema), async (req, res) => {
  const node = await prisma.networkNode.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "networkNode.update", entityType: "NetworkNode", entityId: node.id });
  res.json(node);
});

router.delete("/nodes/:id", requirePermission("network", "delete"), async (req, res) => {
  await prisma.networkNode.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "networkNode.delete", entityType: "NetworkNode", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/edges", requirePermission("network", "create"), validateBody(createEdgeSchema), async (req, res) => {
  const edge = await prisma.networkEdge.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "networkEdge.create", entityType: "NetworkEdge", entityId: edge.id });
  res.status(201).json(edge);
});

router.delete("/edges/:id", requirePermission("network", "delete"), async (req, res) => {
  await prisma.networkEdge.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "networkEdge.delete", entityType: "NetworkEdge", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ───────────────────────── Ping / IP range scanner ─────────────────────────

router.post("/ping", requirePermission("network", "view"), validateBody(z.object({ ipAddress: z.string().min(1) })), async (req, res) => {
  const result = await pingHost(req.body.ipAddress);
  res.json(result);
});

router.get("/ping-stream", requirePermission("network", "view"), (req, res) => {
  const host = String(req.query.host ?? "");
  if (!host || host.length > 253 || !/^[a-zA-Z0-9.:_-]+$/.test(host)) {
    res.status(400).json({ error: "Invalid host" });
    return;
  }
  const countParam = req.query.count;
  const count = countParam === "continuous" ? ("continuous" as const) : Math.min(50, Math.max(1, Number(countParam) || 4));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const proc = streamPing(host, count, res, () => res.end());
  req.on("close", () => proc.kill());
});

router.post(
  "/scan",
  requirePermission("network", "create"),
  validateBody(z.object({ startIp: z.string().min(1), endIp: z.string().min(1) })),
  async (req, res) => {
    try {
      const scan = await startScan(req.body.startIp, req.body.endIp, req.user!.id);
      await logAudit({ userId: req.user!.id, action: "network.scan_start", entityType: "NetworkScan", entityId: scan.id, metadata: req.body });
      res.status(201).json(scan);
    } catch (err) {
      throw new ApiError(400, (err as Error).message);
    }
  }
);

router.get("/scan", requirePermission("network", "view"), async (_req, res) => {
  const scans = await prisma.networkScan.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { startedBy: { select: { firstName: true, lastName: true } } },
  });
  res.json(scans);
});

router.get("/scan/:id", requirePermission("network", "view"), async (req, res) => {
  const scan = await prisma.networkScan.findUnique({
    where: { id: Number(req.params.id) },
    include: { results: { orderBy: { ipAddress: "asc" } } },
  });
  if (!scan) throw new ApiError(404, "Scan not found");
  res.json(scan);
});

router.post("/scan-results/:resultId/promote", requirePermission("network", "edit"), async (req, res) => {
  const result = await prisma.networkScanResult.findUnique({ where: { id: Number(req.params.resultId) } });
  if (!result) throw new ApiError(404, "Scan result not found");

  const node = await prisma.networkNode.create({
    data: {
      type: result.deviceType === "IP Camera / NVR" ? "NVR" : "OTHER",
      label: result.hostname || result.ipAddress,
      ipAddress: result.ipAddress,
      vendor: result.vendor,
      deviceType: result.deviceType,
    },
  });

  await logAudit({ userId: req.user!.id, action: "network.promote_discovered_host", entityType: "NetworkNode", entityId: node.id, metadata: { ipAddress: result.ipAddress } });
  res.status(201).json(node);
});

// ───────────────────────── Switching (switches/routers) ─────────────────────────

// "Adopted" switches are real Assets in a category flagged isSwitchingDevice, with their port
// counts. "Discovered" candidates come from the most recent completed IP range scan, filtered to
// hosts the same real vendor/port heuristic used by the IP Range Scanner classified as
// "Network Switching / Routing" — a single taxonomy label covering both switches and routers,
// so this list is never missing routing gear. No separate SNMP/fingerprinting pass, just the
// same signal already shown there. A candidate already matching an adopted asset's recorded
// static IP is flagged so the UI doesn't invite adopting it twice.
router.get("/switching", requirePermission("network", "view"), async (_req, res) => {
  const adopted = await prisma.asset.findMany({
    where: { category: { isSwitchingDevice: true } },
    select: {
      id: true,
      assetTag: true,
      name: true,
      status: true,
      categoryId: true,
      locationId: true,
      assignedToId: true,
      manufacturer: true,
      model: true,
      serialNumber: true,
      staticIpAddress: true,
      notes: true,
      nextServiceDate: true,
      gridPowered: true,
      remoteManagementEnabled: true,
      featuredImageUrl: true,
      _count: { select: { switchPorts: true } },
    },
    orderBy: { name: "asc" },
  });

  const latestScan = await prisma.networkScan.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { startedAt: "desc" },
    include: { results: { where: { deviceType: "Network Switching / Routing" }, orderBy: { ipAddress: "asc" } } },
  });

  const adoptedIps = new Set(adopted.map((a) => a.staticIpAddress).filter((ip): ip is string => !!ip));
  const discovered = (latestScan?.results ?? []).map((r) => ({
    id: r.id,
    ipAddress: r.ipAddress,
    hostname: r.hostname,
    macAddress: r.macAddress,
    vendor: r.vendor,
    openPorts: r.openPorts,
    alreadyAdopted: adoptedIps.has(r.ipAddress),
  }));

  res.json({
    adopted: adopted.map((a) => ({ ...a, portCount: a._count.switchPorts, _count: undefined })),
    discovered,
    scannedAt: latestScan?.completedAt ?? null,
  });
});

// ───────────────────────── Continuous monitoring (Domotz-style) ─────────────────────────

// Never surfaced to the client — SNMP community strings are write-only from the API's
// perspective, same treatment as NVR/camera passwords elsewhere in this app.
function shapeMonitoredDevice(d: Awaited<ReturnType<typeof prisma.monitoredNetworkDevice.findMany>>[number]) {
  const { snmpCommunity, ...rest } = d;
  return { ...rest, snmpUpTimeTicks: rest.snmpUpTimeTicks != null ? rest.snmpUpTimeTicks.toString() : null, snmpConfigured: Boolean(snmpCommunity) };
}

// Subnets the on-prem relay agent has reported seeing on its own local network interfaces (see
// discover_local_subnets() in agent/kynren_network_relay.py) — read-only convenience data for the
// Monitoring tab so an admin can pick a real, present range instead of typing one blind. Never
// used to auto-populate or auto-trigger anything on its own.
router.get("/discovered-subnets", requirePermission("network", "view"), async (_req, res) => {
  const subnets = await prisma.relayDiscoveredSubnet.findMany({ orderBy: { lastSeenAt: "desc" } });
  res.json(subnets);
});

router.get("/monitor/settings", requirePermission("network", "view"), async (_req, res) => {
  const settings = await prisma.networkMonitorSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  res.json(settings);
});

router.put(
  "/monitor/settings",
  requirePermission("network", "edit"),
  validateBody(updateMonitorSettingsSchema),
  async (req, res) => {
    const settings = await prisma.networkMonitorSettings.upsert({
      where: { id: 1 },
      update: { ...req.body, updatedById: req.user!.id },
      create: { id: 1, ...req.body, updatedById: req.user!.id },
    });
    await logAudit({ userId: req.user!.id, action: "network.monitor_settings_update", entityType: "NetworkMonitorSettings", entityId: 1, metadata: req.body });
    res.json(settings);
  }
);

// Fire-and-forget, same pattern as the manual IP Range Scanner — a full monitoring pass across
// every configured range can take tens of seconds, so this returns immediately and the client
// polls GET /monitor/devices to watch results land.
router.post("/monitor/run-now", requirePermission("network", "edit"), async (req, res) => {
  runNetworkMonitorCycle().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Manual network monitor run failed:", err);
  });
  await logAudit({ userId: req.user!.id, action: "network.monitor_run_now", entityType: "NetworkMonitorSettings", entityId: 1 });
  res.status(202).json({ started: true });
});

router.get("/monitor/devices", requirePermission("network", "view"), async (_req, res) => {
  const devices = await prisma.monitoredNetworkDevice.findMany({
    orderBy: [{ status: "asc" }, { hostname: "asc" }],
  });
  res.json(devices.map(shapeMonitoredDevice));
});

router.post(
  "/monitor/devices/:id/snmp",
  requirePermission("network", "edit"),
  validateBody(updateSnmpConfigSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const { snmpEnabled, snmpCommunity, snmpPort } = req.body as z.infer<typeof updateSnmpConfigSchema>;

    const device = await prisma.monitoredNetworkDevice.update({
      where: { id },
      data: {
        snmpEnabled,
        snmpPort: snmpPort ?? undefined,
        ...(snmpCommunity ? { snmpCommunity: encryptSecret(snmpCommunity) } : {}),
      },
    });
    await logAudit({ userId: req.user!.id, action: "network.monitor_snmp_config", entityType: "MonitoredNetworkDevice", entityId: id });
    res.json(shapeMonitoredDevice(device));
  }
);

export default router;
