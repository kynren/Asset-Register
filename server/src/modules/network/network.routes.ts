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
import { createEdgeSchema, createNodeSchema, updateNodeSchema } from "./network.schema";
import { startScan } from "./scan.service";

const router = Router();
router.use(verifyJwt);

router.get("/graph", requirePermission("network", "view"), async (_req, res) => {
  const [nodes, edges] = await Promise.all([
    prisma.networkNode.findMany({ include: { device: true } }),
    prisma.networkEdge.findMany(),
  ]);

  const shapedNodes = nodes.map((n) => ({
    id: n.id,
    type: n.type,
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

export default router;
