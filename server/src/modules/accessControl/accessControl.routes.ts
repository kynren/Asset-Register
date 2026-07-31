import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import { pingHost } from "../../lib/ping";
import {
  controlDoor,
  createOrUpdateAcsUser,
  deleteAcsUser,
  enrollCard,
  getDeviceInfo,
  getDoorStatus,
  searchAcsEvents,
} from "../../lib/hikvisionIsapi";
import {
  createCredentialSchema,
  createDeviceSchema,
  createDoorSchema,
  doorControlSchema,
  isapiConnectionSchema,
  syncEventsSchema,
  updateCredentialSchema,
  updateDeviceSchema,
  updateDoorSchema,
} from "./accessControl.schema";

const router = Router();
router.use(verifyJwt);

const deviceSelect = {
  id: true,
  name: true,
  ipAddress: true,
  port: true,
  username: true,
  locationId: true,
  location: { select: { id: true, name: true } },
  model: true,
  notes: true,
  status: true,
  lastCheckedAt: true,
  lastEventSyncAt: true,
  createdAt: true,
  doors: { select: { id: true, deviceId: true, doorNumber: true, name: true, lockState: true, lastCheckedAt: true }, orderBy: { doorNumber: "asc" as const } },
  credentials: {
    select: {
      id: true,
      deviceId: true,
      employeeNo: true,
      cardNumber: true,
      hasPin: true,
      status: true,
      validFrom: true,
      validTo: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      doorRights: { select: { doorId: true, planTemplateNo: true, door: { select: { id: true, name: true, doorNumber: true } } } },
    },
  },
};

// Resolves {doorId, planTemplateNo} pairs into the {doorNumber, planTemplateNo} shape ISAPI
// expects, validating every doorId actually belongs to this device (a stale/foreign doorId
// would otherwise silently produce a RightPlan entry ISAPI rejects or, worse, misapplies).
async function resolveRightPlan(deviceId: number, doorRights: { doorId: number; planTemplateNo: string }[]) {
  if (doorRights.length === 0) return [];
  const doors = await prisma.door.findMany({ where: { deviceId, id: { in: doorRights.map((r) => r.doorId) } } });
  const doorNumberById = new Map(doors.map((d) => [d.id, d.doorNumber]));
  return doorRights.map((r) => {
    const doorNumber = doorNumberById.get(r.doorId);
    if (doorNumber === undefined) throw new ApiError(400, `Door ${r.doorId} does not belong to this device`);
    return { doorNumber, planTemplateNo: r.planTemplateNo };
  });
}

function splitCredentials(body: Record<string, any>): { rest: Record<string, any>; encryptedPassword?: string } {
  const { password, ...rest } = body;
  return { rest, encryptedPassword: password ? encryptSecret(password) : undefined };
}

async function loadDeviceWithSecret(id: number) {
  const device = await prisma.accessControlDevice.findUnique({ where: { id } });
  if (!device) throw new ApiError(404, "Access control device not found");
  return device;
}

function devicePassword(device: { encryptedPassword: string | null }): string {
  return device.encryptedPassword ? decryptSecret(device.encryptedPassword) : "";
}

// ───────────────────────── Devices ─────────────────────────

router.get("/devices", requirePermission("access-control", "view"), async (_req, res) => {
  res.json(await prisma.accessControlDevice.findMany({ select: deviceSelect, orderBy: { name: "asc" } }));
});

router.post("/devices", requirePermission("access-control", "create"), validateBody(createDeviceSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const device = await prisma.accessControlDevice.create({ data: { ...rest, encryptedPassword } as any, select: deviceSelect });
  await logAudit({ userId: req.user!.id, action: "accessControlDevice.create", entityType: "AccessControlDevice", entityId: device.id });
  res.status(201).json(device);
});

router.patch("/devices/:id", requirePermission("access-control", "edit"), validateBody(updateDeviceSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const device = await prisma.accessControlDevice.update({
    where: { id: Number(req.params.id) },
    data: { ...rest, ...(encryptedPassword ? { encryptedPassword } : {}) } as any,
    select: deviceSelect,
  });
  await logAudit({ userId: req.user!.id, action: "accessControlDevice.update", entityType: "AccessControlDevice", entityId: device.id });
  res.json(device);
});

router.delete("/devices/:id", requirePermission("access-control", "delete"), async (req, res) => {
  await prisma.accessControlDevice.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "accessControlDevice.delete", entityType: "AccessControlDevice", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// Generic ISAPI reachability check — reuses the same /ISAPI/System/deviceInfo call already
// proven against real hardware for cameras, since every Hikvision device (including access
// controllers) answers it the same way. This is deliberately NOT one of the best-effort
// AccessControl-specific calls, so "Test Connection" stays reliable even before those are
// verified against a real controller.
router.post("/isapi/test-connection", requirePermission("access-control", "view"), validateBody(isapiConnectionSchema), async (req, res) => {
  const { ipAddress, port, username, password } = req.body;
  res.json(await getDeviceInfo(ipAddress, port, username ?? "", password ?? ""));
});

router.post("/devices/:id/check-status", requirePermission("access-control", "edit"), async (req, res) => {
  const device = await loadDeviceWithSecret(Number(req.params.id));
  if (!device.ipAddress) throw new ApiError(400, "This device has no IP address set");

  const { alive } = await pingHost(device.ipAddress);
  const newStatus = alive ? "ONLINE" : "OFFLINE";
  const updated = await prisma.accessControlDevice.update({
    where: { id: device.id },
    data: { status: newStatus, lastCheckedAt: new Date() },
    select: deviceSelect,
  });
  res.json(updated);
});

// Live door lock-state read via ISAPI — refreshes each Door row's lockState in the DB so the
// UI reflects a real read, not a cached guess.
router.post("/devices/:id/refresh-doors", requirePermission("access-control", "edit"), async (req, res) => {
  const device = await loadDeviceWithSecret(Number(req.params.id));
  if (!device.ipAddress) throw new ApiError(400, "This device has no IP address set");

  const result = await getDoorStatus(device.ipAddress, device.port, device.username ?? "", devicePassword(device));
  if (result.ok) {
    for (const d of result.doors) {
      await prisma.door.updateMany({
        where: { deviceId: device.id, doorNumber: d.doorNumber },
        data: { lockState: d.state === "open" ? "UNLOCKED" : d.state === "closed" ? "LOCKED" : "UNKNOWN", lastCheckedAt: new Date() },
      });
    }
  }
  res.json(result);
});

// ───────────────────────── Doors ─────────────────────────

router.post("/devices/:id/doors", requirePermission("access-control", "create"), validateBody(createDoorSchema), async (req, res) => {
  const deviceId = Number(req.params.id);
  await loadDeviceWithSecret(deviceId);
  const door = await prisma.door.create({ data: { ...req.body, deviceId } });
  await logAudit({ userId: req.user!.id, action: "door.create", entityType: "Door", entityId: door.id });
  res.status(201).json(door);
});

router.patch("/doors/:doorId", requirePermission("access-control", "edit"), validateBody(updateDoorSchema), async (req, res) => {
  const door = await prisma.door.update({ where: { id: Number(req.params.doorId) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "door.update", entityType: "Door", entityId: door.id });
  res.json(door);
});

router.delete("/doors/:doorId", requirePermission("access-control", "delete"), async (req, res) => {
  await prisma.door.delete({ where: { id: Number(req.params.doorId) } });
  await logAudit({ userId: req.user!.id, action: "door.delete", entityType: "Door", entityId: Number(req.params.doorId) });
  res.json({ ok: true });
});

// Remote open/close over ISAPI — the actual point of this whole module. Logged to both the
// audit log (who pressed the button) and as an AccessEvent (so it shows up in the same event
// timeline as door-reported grants/denials).
router.post("/doors/:doorId/control", requirePermission("access-control", "edit"), validateBody(doorControlSchema), async (req, res) => {
  const door = await prisma.door.findUnique({ where: { id: Number(req.params.doorId) }, include: { device: true } });
  if (!door) throw new ApiError(404, "Door not found");
  if (!door.device.ipAddress) throw new ApiError(400, "This device has no IP address set");

  const result = await controlDoor(door.device.ipAddress, door.device.port, door.device.username ?? "", devicePassword(door.device), door.doorNumber, req.body.action);

  await prisma.accessEvent.create({
    data: {
      deviceId: door.deviceId,
      doorId: door.id,
      eventType: result.ok ? `REMOTE_${req.body.action.toUpperCase()}` : "REMOTE_CONTROL_ERROR",
      message: `${result.message} (by user #${req.user!.id})`,
      occurredAt: new Date(),
    },
  });
  await logAudit({ userId: req.user!.id, action: `door.${req.body.action}`, entityType: "Door", entityId: door.id, metadata: { ok: result.ok } });

  if (result.ok) {
    // "resume" cancels an always-open/always-close override and hands control back to the
    // door's own schedule — we don't know its resulting state without a real status read, so
    // it's left UNKNOWN here (Refresh Doors will pick up the true state on the next poll).
    const lockState = req.body.action === "open" || req.body.action === "alwaysOpen" ? "UNLOCKED" : req.body.action === "resume" ? "UNKNOWN" : "LOCKED";
    await prisma.door.update({ where: { id: door.id }, data: { lockState, lastCheckedAt: new Date() } });
  }
  res.json(result);
});

// ───────────────────────── Credentials ─────────────────────────

router.post("/devices/:id/credentials", requirePermission("access-control", "create"), validateBody(createCredentialSchema), async (req, res) => {
  const device = await loadDeviceWithSecret(Number(req.params.id));
  if (!device.ipAddress) throw new ApiError(400, "This device has no IP address set");

  const user = await prisma.user.findUnique({ where: { id: req.body.userId } });
  if (!user) throw new ApiError(404, "User not found");

  // employeeNo is the controller's own identifier for this person — device-scoped, so it just
  // needs to be unique per device, not globally; the app User's own id is stable and human-
  // traceable in an audit trail, so it's reused directly rather than minting a separate id.
  const employeeNo = String(user.id);
  const validFrom = req.body.validFrom ? new Date(req.body.validFrom) : null;
  const validTo = req.body.validTo ? new Date(req.body.validTo) : null;
  const rightPlan = await resolveRightPlan(device.id, req.body.doorRights ?? []);

  const provision = await createOrUpdateAcsUser(device.ipAddress, device.port, device.username ?? "", devicePassword(device), {
    employeeNo,
    name: `${user.firstName} ${user.lastName}`,
    validFrom,
    validTo,
    rightPlan,
  });
  if (!provision.ok) throw new ApiError(502, provision.message);

  if (req.body.cardNumber) {
    const cardResult = await enrollCard(device.ipAddress, device.port, device.username ?? "", devicePassword(device), employeeNo, req.body.cardNumber);
    if (!cardResult.ok) throw new ApiError(502, cardResult.message);
  }

  const credential = await prisma.accessCredential.create({
    data: {
      deviceId: device.id,
      userId: user.id,
      employeeNo,
      cardNumber: req.body.cardNumber ?? null,
      hasPin: Boolean(req.body.hasPin),
      validFrom,
      validTo,
      doorRights: { create: (req.body.doorRights ?? []).map((r: { doorId: number; planTemplateNo: string }) => ({ doorId: r.doorId, planTemplateNo: r.planTemplateNo })) },
    },
    include: { doorRights: { select: { doorId: true, planTemplateNo: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "accessCredential.create", entityType: "AccessCredential", entityId: credential.id, metadata: { targetUserId: user.id } });
  res.status(201).json(credential);
});

router.patch("/credentials/:credentialId", requirePermission("access-control", "edit"), validateBody(updateCredentialSchema), async (req, res) => {
  const existing = await prisma.accessCredential.findUnique({ where: { id: Number(req.params.credentialId) }, include: { device: true, user: true } });
  if (!existing) throw new ApiError(404, "Credential not found");

  const validFrom = req.body.validFrom !== undefined ? (req.body.validFrom ? new Date(req.body.validFrom) : null) : existing.validFrom;
  const validTo = req.body.validTo !== undefined ? (req.body.validTo ? new Date(req.body.validTo) : null) : existing.validTo;

  // Door rights live inside the same UserInfo record on the controller (RightPlan), so changing
  // them means re-provisioning the whole person record, not a separate call — same as validity
  // dates already did implicitly by never touching the controller after creation. Only
  // re-provision when doorRights was actually part of this request, to avoid an unnecessary
  // ISAPI round-trip (and possible failure) on a plain status toggle.
  if (req.body.doorRights !== undefined && existing.device.ipAddress) {
    const rightPlan = await resolveRightPlan(existing.deviceId, req.body.doorRights);
    const provision = await createOrUpdateAcsUser(existing.device.ipAddress, existing.device.port, existing.device.username ?? "", devicePassword(existing.device), {
      employeeNo: existing.employeeNo,
      name: `${existing.user.firstName} ${existing.user.lastName}`,
      validFrom,
      validTo,
      rightPlan,
    });
    if (!provision.ok) throw new ApiError(502, provision.message);
  }

  const credential = await prisma.accessCredential.update({
    where: { id: existing.id },
    data: {
      ...(req.body.status ? { status: req.body.status } : {}),
      ...(req.body.validFrom !== undefined ? { validFrom } : {}),
      ...(req.body.validTo !== undefined ? { validTo } : {}),
      ...(req.body.doorRights !== undefined
        ? { doorRights: { deleteMany: {}, create: req.body.doorRights.map((r: { doorId: number; planTemplateNo: string }) => ({ doorId: r.doorId, planTemplateNo: r.planTemplateNo })) } }
        : {}),
    },
    include: { doorRights: { select: { doorId: true, planTemplateNo: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "accessCredential.update", entityType: "AccessCredential", entityId: credential.id });
  res.json(credential);
});

router.delete("/credentials/:credentialId", requirePermission("access-control", "delete"), async (req, res) => {
  const credential = await prisma.accessCredential.findUnique({ where: { id: Number(req.params.credentialId) }, include: { device: true } });
  if (!credential) throw new ApiError(404, "Credential not found");

  if (credential.device.ipAddress) {
    // Best-effort — the local record is removed regardless, so a device that's offline or
    // rejects the delete doesn't leave the app permanently unable to revoke access locally.
    await deleteAcsUser(credential.device.ipAddress, credential.device.port, credential.device.username ?? "", devicePassword(credential.device), credential.employeeNo).catch(() => undefined);
  }
  await prisma.accessCredential.delete({ where: { id: credential.id } });
  await logAudit({ userId: req.user!.id, action: "accessCredential.delete", entityType: "AccessCredential", entityId: credential.id });
  res.json({ ok: true });
});

// ───────────────────────── Event log ─────────────────────────

router.get("/events", requirePermission("access-control", "view"), async (req, res) => {
  const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
  const events = await prisma.accessEvent.findMany({
    where: deviceId ? { deviceId } : undefined,
    orderBy: { occurredAt: "desc" },
    take: 200,
    include: { device: { select: { id: true, name: true } }, door: { select: { id: true, name: true } } },
  });
  res.json(events);
});

// Pulls new events from the controller since the last sync (or the last 24h on first run) and
// persists them — poll-driven, same pattern as the NVR module's check-status and the network
// scanner, rather than requiring the controller to push to a webhook this app would have to
// expose publicly.
router.post("/devices/:id/sync-events", requirePermission("access-control", "edit"), validateBody(syncEventsSchema), async (req, res) => {
  const device = await loadDeviceWithSecret(Number(req.params.id));
  if (!device.ipAddress) throw new ApiError(400, "This device has no IP address set");

  const endTime = req.body.endTime ? new Date(req.body.endTime) : new Date();
  const startTime = req.body.startTime ? new Date(req.body.startTime) : device.lastEventSyncAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  const doors = await prisma.door.findMany({ where: { deviceId: device.id } });
  const doorByNumber = new Map(doors.map((d) => [d.doorNumber, d.id]));

  let position = 0;
  let totalSaved = 0;
  let lastResult = { ok: true, events: [] as any[], hasMore: true, message: "" };
  // Cap the number of pages pulled in one request so a very chatty controller can't hang this
  // endpoint indefinitely — subsequent syncs pick up where lastEventSyncAt left off.
  for (let page = 0; page < 20 && lastResult.hasMore; page++) {
    lastResult = await searchAcsEvents(device.ipAddress, device.port, device.username ?? "", devicePassword(device), { startTime, endTime, searchResultPosition: position, maxResults: 30 });
    if (!lastResult.ok) break;
    for (const e of lastResult.events) {
      await prisma.accessEvent.create({
        data: {
          deviceId: device.id,
          doorId: e.doorNumber !== null && doorByNumber.has(e.doorNumber) ? doorByNumber.get(e.doorNumber)! : null,
          employeeNo: e.employeeNo,
          cardNumber: e.cardNumber,
          eventType: e.eventType,
          message: e.message,
          occurredAt: e.occurredAt,
        },
      });
      totalSaved++;
    }
    position += lastResult.events.length;
    if (lastResult.events.length === 0) break;
  }

  await prisma.accessControlDevice.update({ where: { id: device.id }, data: { lastEventSyncAt: endTime } });
  res.json({ ok: lastResult.ok, saved: totalSaved, message: lastResult.ok ? `Synced ${totalSaved} event(s).` : lastResult.message });
});

export default router;
