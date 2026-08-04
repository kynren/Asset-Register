import path from "path";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import { relayAwarePing } from "../../lib/relayTransport";
import { testDeviceConnection } from "../../lib/deviceConnection";
import { discoverOnvifChannels } from "../../lib/onvifDiscovery";
import { getSessionFilePath, getSessionStatus, startStreamSession, stopSession } from "../../lib/streamRelay";
import { gotoPtzPreset, listPtzPresets, sendPtzCommand } from "../../lib/ptzControl";
import { RECORDING_ROOT, getActiveRecording, runRetentionSweep, startRecording, stopRecording } from "../../lib/recording";
import { getMotionWatchStatus, startMotionWatch, stopMotionWatch } from "../../lib/motionWatch";
import { buildIsapiRtspUrl, getDeviceInfo, getInputProxyChannels } from "../../lib/hikvisionIsapi";
import {
  cameraEventSchema,
  createCameraSchema,
  createNvrSchema,
  discoverCamerasSchema,
  gotoPresetSchema,
  importCamerasSchema,
  isapiConnectionSchema,
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
  locationId: true,
  location: { select: { id: true, name: true } },
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
      locationId: true,
      location: { select: { id: true, name: true } },
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

// ipAddress/port stay blank on the clone — copying a real NVR's network address would create a
// second device claiming the same host, which isn't a duplicate anyone wants.
router.post("/:id/duplicate", requirePermission("nvr", "create"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.nvr.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "NVR not found");

  const clone = await prisma.nvr.create({
    data: {
      name: `${source.name} (Copy)`,
      protocol: source.protocol,
      locationId: source.locationId,
      model: source.model,
      notes: source.notes,
      status: "UNKNOWN",
    },
    select: nvrSelect,
  });
  await logAudit({ userId: req.user!.id, action: "nvr.duplicate", entityType: "Nvr", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

router.post("/:id/check-status", requirePermission("nvr", "edit"), async (req, res) => {
  const nvr = await prisma.nvr.findUnique({ where: { id: Number(req.params.id) } });
  if (!nvr) throw new ApiError(404, "NVR not found");
  if (!nvr.ipAddress) throw new ApiError(400, "This NVR has no IP address set");

  const { alive } = await relayAwarePing(nvr.ipAddress);
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

// Stateful discovery for an already-saved NVR — uses its own stored credentials (decrypted
// server-side, same convention as cameraOnvifOptions()) so the Discovery Protocol tab doesn't
// need the admin to re-type a password that was never sent back to the browser after saving.
router.post("/:id/discover-channels", requirePermission("nvr", "view"), async (req, res) => {
  const nvr = await prisma.nvr.findUnique({ where: { id: Number(req.params.id) } });
  if (!nvr) throw new ApiError(404, "NVR not found");
  if (!nvr.ipAddress) throw new ApiError(400, "This NVR has no IP address set.");

  const username = nvr.username ?? "";
  const password = nvr.encryptedPassword ? decryptSecret(nvr.encryptedPassword) : "";

  if (nvr.protocol === "ISAPI") {
    const result = await getInputProxyChannels(nvr.ipAddress, nvr.port ?? undefined, username, password);
    const channels = result.channels.map((ch) => ({
      ...ch,
      streamUri: buildIsapiRtspUrl(nvr.ipAddress!, undefined, username, password, ch.channelNumber),
    }));
    res.json({ ...result, protocol: "ISAPI", channels });
    return;
  }

  const result = await discoverOnvifChannels(nvr.ipAddress, nvr.port ?? undefined, username, password);
  res.json({ ...result, protocol: "ONVIF" });
});

router.post("/:id/import-cameras", requirePermission("nvr", "create"), validateBody(importCamerasSchema), async (req, res) => {
  const nvrId = Number(req.params.id);
  const nvr = await prisma.nvr.findUnique({ where: { id: nvrId } });
  if (!nvr) throw new ApiError(404, "NVR not found");

  const created = await prisma.$transaction(
    req.body.channels.map((ch: {
      name: string;
      streamUri?: string | null;
      snapshotUri?: string | null;
      channel?: number | null;
      ipAddress?: string | null;
      port?: number | null;
      username?: string | null;
      password?: string | null;
    }) =>
      prisma.camera.create({
        data: {
          nvrId,
          name: ch.name,
          streamUrl: ch.streamUri ?? null,
          channel: ch.channel ?? null,
          ipAddress: ch.ipAddress ?? null,
          port: ch.port ?? null,
          username: ch.username ?? null,
          encryptedPassword: ch.password ? encryptSecret(ch.password) : null,
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

// ipAddress and streamUrl (which embeds the source IP) stay blank on the clone for the same
// reason as NVR duplicate — same channel/PTZ config, but no claimed network address.
router.post("/cameras/:cameraId/duplicate", requirePermission("nvr", "create"), async (req, res) => {
  const cameraId = Number(req.params.cameraId);
  const source = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!source) throw new ApiError(404, "Camera not found");

  const clone = await prisma.camera.create({
    data: {
      nvrId: source.nvrId,
      name: `${source.name} (Copy)`,
      channel: source.channel,
      locationId: source.locationId,
      ptzEnabled: source.ptzEnabled,
      status: "UNKNOWN",
    },
  });
  await logAudit({ userId: req.user!.id, action: "camera.duplicate", entityType: "Camera", entityId: clone.id, metadata: { sourceId: cameraId } });
  res.status(201).json(clone);
});

router.post("/cameras/:cameraId/check-status", requirePermission("nvr", "edit"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ipAddress) throw new ApiError(400, "This camera has no IP address set");

  const { alive } = await relayAwarePing(camera.ipAddress);
  const newStatus = alive ? "ONLINE" : "OFFLINE";

  if (newStatus !== camera.status) {
    await prisma.cameraEvent.create({
      data: { cameraId: camera.id, nvrId: camera.nvrId, type: newStatus === "ONLINE" ? "ONLINE" : "OFFLINE", message: `Status changed to ${newStatus}` },
    });
  }

  const updated = await prisma.camera.update({ where: { id: camera.id }, data: { status: newStatus, lastCheckedAt: new Date() } });
  res.json(updated);
});

// Lightweight ping for live UI displays (video matrix latency readout) — deliberately does
// NOT persist status/lastCheckedAt or write a CameraEvent like check-status does, since this
// gets polled every few seconds per visible tile and would otherwise spam the event log.
router.get("/cameras/:cameraId/live-latency", requirePermission("nvr", "view"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) }, select: { ipAddress: true } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ipAddress) {
    res.json({ alive: false, responseTimeMs: null });
    return;
  }
  res.json(await relayAwarePing(camera.ipAddress));
});

function cameraOnvifOptions(camera: { ipAddress: string | null; port: number | null; username: string | null; encryptedPassword: string | null }) {
  if (!camera.ipAddress) throw new ApiError(400, "This camera has no IP address set — required for ONVIF PTZ control.");
  return {
    hostname: camera.ipAddress,
    port: camera.port ?? undefined,
    username: camera.username ?? undefined,
    password: camera.encryptedPassword ? decryptSecret(camera.encryptedPassword) : undefined,
  };
}

// Sends a real ONVIF ContinuousMove/Stop (or GotoHomePosition) command to the camera and logs
// the outcome — success or a real connection/protocol failure — as a CameraEvent.
router.post("/cameras/:cameraId/ptz", requirePermission("nvr", "edit"), validateBody(ptzCommandSchema), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ptzEnabled) throw new ApiError(400, "PTZ is not enabled for this camera");

  const result = await sendPtzCommand(cameraOnvifOptions(camera), req.body.command, req.body.speed);

  await prisma.cameraEvent.create({
    data: { cameraId: camera.id, nvrId: camera.nvrId, type: result.ok ? "PTZ_COMMAND" : "PTZ_ERROR", message: `${req.body.command}: ${result.message}` },
  });
  await logAudit({ userId: req.user!.id, action: "camera.ptz_command", entityType: "Camera", entityId: camera.id, metadata: { ...req.body, ok: result.ok } });

  res.json({ ok: result.ok, command: req.body.command, message: result.message });
});

router.get("/cameras/:cameraId/ptz/presets", requirePermission("nvr", "view"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ptzEnabled) throw new ApiError(400, "PTZ is not enabled for this camera");

  const result = await listPtzPresets(cameraOnvifOptions(camera));
  res.json(result);
});

router.post("/cameras/:cameraId/ptz/goto-preset", requirePermission("nvr", "edit"), validateBody(gotoPresetSchema), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.ptzEnabled) throw new ApiError(400, "PTZ is not enabled for this camera");

  const result = await gotoPtzPreset(cameraOnvifOptions(camera), req.body.presetToken);

  await prisma.cameraEvent.create({
    data: { cameraId: camera.id, nvrId: camera.nvrId, type: result.ok ? "PTZ_PRESET" : "PTZ_ERROR", message: result.message },
  });
  await logAudit({ userId: req.user!.id, action: "camera.ptz_goto_preset", entityType: "Camera", entityId: camera.id, metadata: { ...req.body, ok: result.ok } });

  res.json(result);
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

// ───────────────────────── Recording + retention ─────────────────────────

// Aggregate recordings across every camera, newest first — powers the NVR Playback Center.
router.get("/recordings", requirePermission("nvr", "view"), async (_req, res) => {
  const recordings = await prisma.cameraRecording.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
    include: { camera: { select: { id: true, name: true, nvr: { select: { id: true, name: true } } } } },
  });
  res.json(recordings);
});

router.get("/cameras/:cameraId/recordings", requirePermission("nvr", "view"), async (req, res) => {
  const cameraId = Number(req.params.cameraId);
  const recordings = await prisma.cameraRecording.findMany({ where: { cameraId }, orderBy: { startedAt: "desc" }, take: 100 });
  const activeInfo = getActiveRecording(cameraId);
  res.json({ recordings, active: activeInfo });
});

router.post("/cameras/:cameraId/recordings/start", requirePermission("nvr", "edit"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");
  if (!camera.streamUrl) throw new ApiError(400, "This camera has no stream URL set — required to start a recording.");

  try {
    const { recordingId } = await startRecording(camera.id, camera.streamUrl, req.body?.trigger ?? "MANUAL");
    await prisma.cameraEvent.create({ data: { cameraId: camera.id, nvrId: camera.nvrId, type: "RECORDING_START", message: `Recording #${recordingId} started` } });
    await logAudit({ userId: req.user!.id, action: "camera.recording_start", entityType: "Camera", entityId: camera.id, metadata: { recordingId } });
    res.status(201).json({ recordingId });
  } catch (err) {
    throw new ApiError(400, (err as Error).message);
  }
});

router.post("/cameras/:cameraId/recordings/stop", requirePermission("nvr", "edit"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");

  const result = await stopRecording(camera.id);
  if (!result) throw new ApiError(400, "No recording is currently in progress for this camera.");

  await prisma.cameraEvent.create({
    data: { cameraId: camera.id, nvrId: camera.nvrId, type: result.failed ? "RECORDING_ERROR" : "RECORDING_STOP", message: result.failMessage ?? `Recording #${result.recordingId} stopped` },
  });
  await logAudit({ userId: req.user!.id, action: "camera.recording_stop", entityType: "Camera", entityId: camera.id, metadata: result });

  res.json(result);
});

router.get("/recordings/:id/download", requirePermission("nvr", "view"), async (req, res) => {
  const recording = await prisma.cameraRecording.findUnique({ where: { id: Number(req.params.id) } });
  if (!recording) throw new ApiError(404, "Recording not found");

  const absolutePath = path.join(RECORDING_ROOT, recording.filePath);
  res.download(absolutePath, path.basename(recording.filePath), (err) => {
    if (err) res.status(404).json({ error: "Recording file not found on disk (it may still be recording, or was removed by the retention sweep)." });
  });
});

router.post("/retention/run", requirePermission("nvr", "edit"), async (req, res) => {
  const result = await runRetentionSweep();
  await logAudit({ userId: req.user!.id, action: "nvr.retention_run", metadata: result });
  res.json(result);
});

// ───────────────────────── Motion detection (real ONVIF event subscription) ─────────────────────────

router.get("/cameras/:cameraId/motion-watch", requirePermission("nvr", "view"), async (req, res) => {
  const status = getMotionWatchStatus(Number(req.params.cameraId));
  res.json(status ?? { status: "stopped", error: null, eventsSeen: 0 });
});

router.post("/cameras/:cameraId/motion-watch/start", requirePermission("nvr", "edit"), async (req, res) => {
  const camera = await prisma.camera.findUnique({ where: { id: Number(req.params.cameraId) } });
  if (!camera) throw new ApiError(404, "Camera not found");

  const result = await startMotionWatch(camera.id, cameraOnvifOptions(camera));
  await logAudit({ userId: req.user!.id, action: "camera.motion_watch_start", entityType: "Camera", entityId: camera.id, metadata: result });
  res.json(result);
});

router.post("/cameras/:cameraId/motion-watch/stop", requirePermission("nvr", "edit"), async (req, res) => {
  const stopped = stopMotionWatch(Number(req.params.cameraId));
  await logAudit({ userId: req.user!.id, action: "camera.motion_watch_stop", entityType: "Camera", entityId: Number(req.params.cameraId), metadata: { stopped } });
  res.json({ stopped });
});

// ───────────────────────── Hikvision ISAPI (NVR-level discovery only) ─────────────────────────
// Cameras themselves always connect over RTSP (see the live feed relay below); ISAPI here is
// used only to test reachability of an NVR and to discover its managed camera channels
// ("get groups") before importing them — mirrors the ONVIF discover-cameras/test-connection
// routes above.

router.post("/isapi/test-connection", requirePermission("nvr", "view"), validateBody(isapiConnectionSchema), async (req, res) => {
  const { ipAddress, port, username, password } = req.body;
  const result = await getDeviceInfo(ipAddress, port ?? undefined, username ?? "", password ?? "");
  res.json(result);
});

// "Get groups" — the real list of camera channels an NVR/DVR manages via ISAPI.
router.post("/isapi/channels", requirePermission("nvr", "view"), validateBody(isapiConnectionSchema), async (req, res) => {
  const { ipAddress, port, username, password } = req.body;
  const result = await getInputProxyChannels(ipAddress, port ?? undefined, username ?? "", password ?? "");
  const channels = result.channels.map((ch) => ({
    ...ch,
    streamUri: buildIsapiRtspUrl(ipAddress, undefined, username ?? "", password ?? "", ch.channelNumber),
  }));
  res.json({ ...result, channels });
});

// ───────────────────────── Live feed relay (RTSP → HLS via ffmpeg) ─────────────────────────
// Stateless and keyed by a session id rather than a saved Camera row, so live preview works
// while adding a camera (before it has been saved) as well as when editing an existing one.

router.post("/stream/sessions", requirePermission("nvr", "view"), validateBody(startStreamSchema), async (req, res) => {
  const sessionId = await startStreamSession(req.body.streamUrl);
  res.status(201).json({ sessionId });
});

router.get("/stream/sessions/:sessionId/status", requirePermission("nvr", "view"), async (req, res) => {
  res.json(await getSessionStatus(req.params.sessionId));
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
