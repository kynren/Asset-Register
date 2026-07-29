import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { encryptSecret } from "../../lib/crypto";
import { pingHost } from "../../lib/ping";
import { testDeviceConnection } from "../../lib/deviceConnection";
import { discoverOnvifChannels } from "../../lib/onvifDiscovery";
import { getSessionFilePath, getSessionStatus, startStreamSession, stopSession } from "../../lib/streamRelay";
import {
  cameraEventSchema,
  createCameraSchema,
  createNvrSchema,
  discoverCamerasSchema,
  importCamerasSchema,
  ptzCommandSchema,
  startStreamSchema,
  testConnectionSchema,
  updateCameraSchema,
  updateNvrSchema,
} from "./nvr.schema";

const router = Router();
router.use(verifyJwt);

const nvrSelect = {
  id: true,
  name: true,
  ipAddress: true,
  port: true,
  protocol: true,
  username: true,
  location: true,
  model: true,
  notes: true,
  status: true,
  lastCheckedAt: true,
  createdAt: true,
  cameras: {
    select: {
      id: true,
      nvrId: true,
      name: true,
      channel: true,
      location: true,
      ipAddress: true,
      port: true,
      username: true,
      streamUrl: true,
      ptzEnabled: true,
      status: true,
      lastCheckedAt: true,
    },
  },
};

function splitCredentials(body: Record<string, any>): { rest: Record<string, any>; encryptedPassword?: string } {
  const { password, ...rest } = body;
  return { rest, encryptedPassword: password ? encryptSecret(password) : undefined };
}

router.get("/", requirePermission("nvr", "view"), async (_req, res) => {
  res.json(await prisma.nvr.findMany({ select: nvrSelect, orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("nvr", "create"), validateBody(createNvrSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const nvr = await prisma.nvr.create({ data: { ...rest, encryptedPassword } as any, select: nvrSelect });
  await logAudit({ userId: req.user!.id, action: "nvr.create", entityType: "Nvr", entityId: nvr.id });
  res.status(201).json(nvr);
});

router.patch("/:id", requirePermission("nvr", "edit"), validateBody(updateNvrSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const nvr = await prisma.nvr.update({
    where: { id: Number(req.params.id) },
    data: { ...rest, ...(encryptedPassword ? { encryptedPassword } : {}) } as any,
    select: nvrSelect,
  });
  await logAudit({ userId: req.user!.id, action: "nvr.update", entityType: "Nvr", entityId: nvr.id });
  res.json(nvr);
});

router.delete("/:id", requirePermission("nvr", "delete"), async (req, res) => {
  await prisma.nvr.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "nvr.delete", entityType: "Nvr", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/:id/check-status", requirePermission("nvr", "edit"), async (req, res) => {
  const nvr = await prisma.nvr.findUnique({ where: { id: Number(req.params.id) } });
  if (!nvr) throw new ApiError(404, "NVR not found");
  if (!nvr.ipAddress) throw new ApiError(400, "This NVR has no IP address set");

  const { alive } = await pingHost(nvr.ipAddress);
  const newStatus = alive ? "ONLINE" : "OFFLINE";

  if (newStatus !== nvr.status) {
    await prisma.cameraEvent.create({
      data: { nvrId: nvr.id, type: newStatus === "ONLINE" ? "ONLINE" : "OFFLINE", message: `Status changed to ${newStatus}` },
    });
  }

  const updated = await prisma.nvr.update({
    where: { id: nvr.id },
    data: { status: newStatus, lastCheckedAt: new Date() },
    select: nvrSelect,
  });
  res.json(updated);
});

// Stateless — works against whatever host/port/protocol is currently typed into the Add/Edit
// form, so admins can verify reachability before saving, not just for already-persisted devices.
router.post("/test-connection", requirePermission("nvr", "view"), validateBody(testConnectionSchema), async (req, res) => {
  const { ipAddress, port, protocol } = req.body;
  const result = await testDeviceConnection(ipAddress, port ?? (protocol === "RTSP" ? 554 : 80), protocol);
  res.json(result);
});

router.post("/discover-cameras", requirePermission("nvr", "view"), validateBody(discoverCamerasSchema), async (req, res) => {
  const { ipAddress, port, username, password } = req.body;
  const result = await discoverOnvifChannels(ipAddress, port ?? undefined, username, password);
  res.json(result);
});

router.post("/:id/import-cameras", requirePermission("nvr", "create"), validateBody(importCamerasSchema), async (req, res) => {
  const nvrId = Number(req.params.id);
  const nvr = await prisma.nvr.findUnique({ where: { id: nvrId } });
  if (!nvr) throw new ApiError(404, "NVR not found");

  const created = await prisma.$transaction(
    req.body.channels.map((ch: { name: string; streamUri?: string | null; snapshotUri?: string | null }) =>
      prisma.camera.create({
        data: {
          nvrId,
          name: ch.name,
          streamUrl: ch.streamUri ?? null,
          status: "UNKNOWN",
        },
      })
    )
  );

  await logAudit({ userId: req.user!.id, action: "nvr.cameras_imported", entityType: "Nvr", entityId: nvrId, metadata: { count: created.length } });
  res.status(201).json(created);
});

router.post("/:id/cameras", requirePermission("nvr", "create"), validateBody(createCameraSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const camera = await prisma.camera.create({ data: { ...rest, encryptedPassword, nvrId: Number(req.params.id) } as any });
  await logAudit({ userId: req.user!.id, action: "camera.create", entityType: "Camera", entityId: camera.id });
  res.status(201).json(camera);
});

router.patch("/cameras/:cameraId", requirePermission("nvr", "edit"), validateBody(updateCameraSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const camera = await prisma.camera.update({
    where: { id: Number(req.params.cameraId) },
    data: { ...rest, ...(encryptedPassword ? { encryptedPassword } : {}) } as any,
  });
  await logAudit({ userId: req.user!.id, action: "camera.update", entityType: "Camera", entityId: camera.id });
  res.json(camera);
});

router.delete("/cameras/:cameraId", requirePermission("nvr", "delete"), async (req, res) => {
  await prisma.camera.delete({ where: { id: Number(req.params.cameraId) } });
  await logAudit({ userId: req.user!.id, action: "camera.delete", entityType: "Camera", entityId: Number(req.params.cameraId) });
  res.json({ ok: true });
});

router.post("/cameras/:cameraId/check-status", requirePermission("nvr", "edit"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ipAddress) throw new ApiError(400, "This camera has no IP address set");

  const { alive } = await pingHost(camera.ipAddress);
  const newStatus = alive ? "ONLINE" : "OFFLINE";

  if (newStatus !== camera.status) {
    await prisma.cameraEvent.create({
      data: { cameraId: camera.id, nvrId: camera.nvrId, type: newStatus === "ONLINE" ? "ONLINE" : "OFFLINE", message: `Status changed to ${newStatus}` },
    });
  }

  const updated = await prisma.camera.update({ where: { id: camera.id }, data: { status: newStatus, lastCheckedAt: new Date() } });
  res.json(updated);
});

// PTZ control is a placeholder pending real ONVIF/vendor SDK integration with physical hardware —
// it validates the command and logs it as a camera event so the UI/API contract is ready to wire up.
router.post("/cameras/:cameraId/ptz", requirePermission("nvr", "edit"), validateBody(ptzCommandSchema), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ptzEnabled) throw new ApiError(400, "PTZ is not enabled for this camera");

  await prisma.cameraEvent.create({
    data: { cameraId: camera.id, nvrId: camera.nvrId, type: "PTZ_COMMAND", message: req.body.command },
  });
  await logAudit({ userId: req.user!.id, action: "camera.ptz_command", entityType: "Camera", entityId: camera.id, metadata: req.body });

  res.json({ ok: true, command: req.body.command });
});

router.post("/cameras/:cameraId/events", requirePermission("nvr", "edit"), validateBody(cameraEventSchema), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");

  const event = await prisma.cameraEvent.create({
    data: { cameraId: camera.id, nvrId: camera.nvrId, type: req.body.type, message: req.body.message },
  });
  res.status(201).json(event);
});

router.get("/events", requirePermission("nvr", "view"), async (req, res) => {
  const nvrId = req.query.nvrId ? Number(req.query.nvrId) : undefined;
  const cameraId = req.query.cameraId ? Number(req.query.cameraId) : undefined;
  const events = await prisma.cameraEvent.findMany({
    where: { nvrId, cameraId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { camera: { select: { name: true } }, nvr: { select: { name: true } } },
  });
  res.json(events);
});

// ───────────────────────── Live feed relay (RTSP → HLS via ffmpeg) ─────────────────────────
// Stateless and keyed by a session id rather than a saved Camera row, so live preview works
// while adding a camera (before it has been saved) as well as when editing an existing one.

router.post("/stream/sessions", requirePermission("nvr", "view"), validateBody(startStreamSchema), (req, res) => {
  const sessionId = startStreamSession(req.body.streamUrl);
  res.status(201).json({ sessionId });
});

router.get("/stream/sessions/:sessionId/status", requirePermission("nvr", "view"), (req, res) => {
  res.json(getSessionStatus(req.params.sessionId));
});

router.get("/stream/sessions/:sessionId/:file", requirePermission("nvr", "view"), (req, res) => {
  const { file } = req.params;
  if (!/^[\w.-]+\.(m3u8|ts)$/.test(file)) throw new ApiError(400, "Invalid stream file name");

  const filePath = getSessionFilePath(req.params.sessionId, file);
  if (!filePath) throw new ApiError(404, "Stream session not found");

  res.setHeader("Cache-Control", "no-store");
  res.type(file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "Stream segment not ready yet" });
  });
});

router.delete("/stream/sessions/:sessionId", requirePermission("nvr", "view"), (req, res) => {
  stopSession(req.params.sessionId);
  res.json({ ok: true });
});

export default router;
