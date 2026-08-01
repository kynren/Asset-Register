import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import { pingHost } from "../../lib/ping";
import { attemptConnect, getCoordinator, listDevices, updateCoordinatorConfig } from "../../lib/zigbeeCoordinator";
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
  createAccessGroupSchema,
  createCredentialSchema,
  createDeviceSchema,
  createDoorSchema,
  createOrganizationSchema,
  createPersonCardSchema,
  createPersonSchema,
  doorControlSchema,
  isapiConnectionSchema,
  syncEventsSchema,
  updateAccessGroupSchema,
  updateCredentialSchema,
  updateDeviceSchema,
  updateDoorSchema,
  updateOrganizationSchema,
  updatePersonSchema,
  updateZigbeeCoordinatorSchema,
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
  doors: { select: { id: true, deviceId: true, doorNumber: true, name: true, lockState: true, doorState: true, lastCheckedAt: true }, orderBy: { doorNumber: "asc" as const } },
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
      person: { select: { id: true, personId: true, name: true, email: true } },
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

// A Hikvision access controller comes with one or more physical doors wired to it — this reads
// them straight from the device (ISAPI /AccessControl/Door/status reports one entry per door)
// and upserts a Door row per doorNumber the device reports, so the user doesn't have to know or
// manually enter how many doors a given controller has. Existing doors get their doorState (and
// lockState, if the device actually reported one — see IsapiDoorStatus) refreshed; a doorNumber
// never seen before gets created with a default name ("Door N") the user can rename. Called both
// right after a device is added and from the "Refresh Doors" button.
async function discoverDoors(deviceId: number, ipAddress: string, port: number | null, username: string, password: string) {
  const result = await getDoorStatus(ipAddress, port, username, password);
  if (!result.ok) return result;
  for (const d of result.doors) {
    const doorState = d.doorState === "open" ? "OPEN" : d.doorState === "closed" ? "CLOSED" : "UNKNOWN";
    // Only touch lockState when the device actually reported one — most firmware doesn't
    // include lock-relay state alongside door-contact state, and overwriting a value set by a
    // real control command (see the /doors/:doorId/control route) with "unknown" would regress it.
    const lockState = d.lockState === "unlocked" ? "UNLOCKED" : d.lockState === "locked" ? "LOCKED" : undefined;
    await prisma.door.upsert({
      where: { deviceId_doorNumber: { deviceId, doorNumber: d.doorNumber } },
      update: { doorState, ...(lockState ? { lockState } : {}), lastCheckedAt: new Date() },
      create: { deviceId, doorNumber: d.doorNumber, name: `Door ${d.doorNumber}`, doorState, lockState: lockState ?? "UNKNOWN", lastCheckedAt: new Date() },
    });
  }
  return result;
}

// ───────────────────────── Devices ─────────────────────────

router.get("/devices", requirePermission("access-control", "view"), async (_req, res) => {
  res.json(await prisma.accessControlDevice.findMany({ select: deviceSelect, orderBy: { name: "asc" } }));
});

router.post("/devices", requirePermission("access-control", "create"), validateBody(createDeviceSchema), async (req, res) => {
  const { rest, encryptedPassword } = splitCredentials(req.body);
  const device = await prisma.accessControlDevice.create({ data: { ...rest, encryptedPassword } as any, select: deviceSelect });
  await logAudit({ userId: req.user!.id, action: "accessControlDevice.create", entityType: "AccessControlDevice", entityId: device.id });

  // Best-effort immediate door discovery so the card shows its real doors right away instead
  // of "No doors added yet" until someone clicks Refresh Doors — a failure here (unreachable
  // device) is fine, Refresh Doors retries the same discovery once it's reachable.
  if (device.ipAddress) {
    await discoverDoors(device.id, device.ipAddress, device.port, device.username ?? "", encryptedPassword ? decryptSecret(encryptedPassword) : "").catch(() => undefined);
  }

  const withDoors = await prisma.accessControlDevice.findUnique({ where: { id: device.id }, select: deviceSelect });
  res.status(201).json(withDoors ?? device);
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

  const result = await discoverDoors(device.id, device.ipAddress, device.port, device.username ?? "", devicePassword(device));
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

  const person = await prisma.person.findUnique({ where: { id: req.body.personId } });
  if (!person) throw new ApiError(404, "Person not found");

  // employeeNo is the controller's own identifier for this person — device-scoped, so it just
  // needs to be unique per device, not globally; the directory Person's own id is stable and
  // human-traceable in an audit trail, so it's reused directly rather than minting a separate id.
  const employeeNo = String(person.id);
  const validFrom = req.body.validFrom ? new Date(req.body.validFrom) : null;
  const validTo = req.body.validTo ? new Date(req.body.validTo) : null;
  const rightPlan = await resolveRightPlan(device.id, req.body.doorRights ?? []);

  const provision = await createOrUpdateAcsUser(device.ipAddress, device.port, device.username ?? "", devicePassword(device), {
    employeeNo,
    name: person.name,
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
      personId: person.id,
      employeeNo,
      cardNumber: req.body.cardNumber ?? null,
      hasPin: Boolean(req.body.hasPin),
      validFrom,
      validTo,
      doorRights: { create: (req.body.doorRights ?? []).map((r: { doorId: number; planTemplateNo: string }) => ({ doorId: r.doorId, planTemplateNo: r.planTemplateNo })) },
    },
    include: { doorRights: { select: { doorId: true, planTemplateNo: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "accessCredential.create", entityType: "AccessCredential", entityId: credential.id, metadata: { targetPersonId: person.id } });
  res.status(201).json(credential);
});

router.patch("/credentials/:credentialId", requirePermission("access-control", "edit"), validateBody(updateCredentialSchema), async (req, res) => {
  const existing = await prisma.accessCredential.findUnique({ where: { id: Number(req.params.credentialId) }, include: { device: true, person: true } });
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
      name: existing.person.name,
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

// ───────────────────────── ZigBee (scaffold — see server/src/lib/zigbeeCoordinator.ts) ─────────────────────────
// For standalone ZigBee door/window contact sensors and locks — Hikvision controllers
// themselves are never ZigBee, so this is entirely separate from the /devices routes above.

router.get("/zigbee/coordinator", requirePermission("access-control", "view"), async (_req, res) => {
  res.json(await getCoordinator("ACCESS_CONTROL"));
});

router.patch("/zigbee/coordinator", requirePermission("access-control", "edit"), validateBody(updateZigbeeCoordinatorSchema), async (req, res) => {
  res.json(await updateCoordinatorConfig("ACCESS_CONTROL", req.body.serialPort));
});

router.post("/zigbee/coordinator/connect", requirePermission("access-control", "edit"), async (_req, res) => {
  res.json(await attemptConnect("ACCESS_CONTROL"));
});

router.get("/zigbee/devices", requirePermission("access-control", "view"), async (_req, res) => {
  res.json(await listDevices("ACCESS_CONTROL"));
});

// ───────────────────────── Organizations (Person directory tree) ─────────────────────────

router.get("/organizations", requirePermission("access-control", "view"), async (_req, res) => {
  res.json(await prisma.organization.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }));
});

router.post("/organizations", requirePermission("access-control", "create"), validateBody(createOrganizationSchema), async (req, res) => {
  const org = await prisma.organization.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "organization.create", entityType: "Organization", entityId: org.id });
  res.status(201).json(org);
});

router.patch("/organizations/:id", requirePermission("access-control", "edit"), validateBody(updateOrganizationSchema), async (req, res) => {
  const org = await prisma.organization.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "organization.update", entityType: "Organization", entityId: org.id });
  res.json(org);
});

router.delete("/organizations/:id", requirePermission("access-control", "delete"), async (req, res) => {
  await prisma.organization.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "organization.delete", entityType: "Organization", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ───────────────────────── Persons ─────────────────────────

const personSelect = {
  id: true,
  personId: true,
  name: true,
  gender: true,
  email: true,
  phone: true,
  organizationId: true,
  organization: { select: { id: true, name: true } },
  validFrom: true,
  validTo: true,
  longTermEffective: true,
  remark: true,
  photoUrl: true,
  cards: { select: { id: true, cardNumber: true, cardType: true }, orderBy: { createdAt: "asc" as const } },
  createdAt: true,
};

router.get("/persons", requirePermission("access-control", "view"), async (req, res) => {
  const organizationId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined;
  res.json(
    await prisma.person.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { personId: { contains: search, mode: "insensitive" } }] }
          : {}),
      },
      select: personSelect,
      orderBy: { name: "asc" },
    })
  );
});

router.post("/persons", requirePermission("access-control", "create"), validateBody(createPersonSchema), async (req, res) => {
  const { validFrom, validTo, ...rest } = req.body;
  const person = await prisma.person.create({
    data: { ...rest, validFrom: validFrom ? new Date(validFrom) : null, validTo: validTo ? new Date(validTo) : null },
    select: personSelect,
  });
  await logAudit({ userId: req.user!.id, action: "person.create", entityType: "Person", entityId: person.id });
  res.status(201).json(person);
});

router.patch("/persons/:id", requirePermission("access-control", "edit"), validateBody(updatePersonSchema), async (req, res) => {
  const { validFrom, validTo, ...rest } = req.body;
  const person = await prisma.person.update({
    where: { id: Number(req.params.id) },
    data: { ...rest, ...(validFrom !== undefined ? { validFrom: validFrom ? new Date(validFrom) : null } : {}), ...(validTo !== undefined ? { validTo: validTo ? new Date(validTo) : null } : {}) },
    select: personSelect,
  });
  await logAudit({ userId: req.user!.id, action: "person.update", entityType: "Person", entityId: person.id });
  res.json(person);
});

router.delete("/persons/:id", requirePermission("access-control", "delete"), async (req, res) => {
  await prisma.person.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "person.delete", entityType: "Person", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/persons/:id/cards", requirePermission("access-control", "edit"), validateBody(createPersonCardSchema), async (req, res) => {
  const personId = Number(req.params.id);
  const card = await prisma.personCard.create({ data: { personId, cardNumber: req.body.cardNumber, cardType: req.body.cardType ?? "Normal Card" } });
  await logAudit({ userId: req.user!.id, action: "personCard.create", entityType: "PersonCard", entityId: card.id });
  res.status(201).json(card);
});

router.delete("/persons/:personId/cards/:cardId", requirePermission("access-control", "edit"), async (req, res) => {
  await prisma.personCard.delete({ where: { id: Number(req.params.cardId) } });
  await logAudit({ userId: req.user!.id, action: "personCard.delete", entityType: "PersonCard", entityId: Number(req.params.cardId) });
  res.json({ ok: true });
});

// ───────────────────────── Access Groups ─────────────────────────

const accessGroupSelect = {
  id: true,
  name: true,
  planTemplateNo: true,
  lastAppliedAt: true,
  createdAt: true,
  members: { select: { id: true, personId: true, person: { select: { id: true, personId: true, name: true, organization: { select: { id: true, name: true } } } } } },
  doors: { select: { id: true, doorId: true, door: { select: { id: true, name: true, doorNumber: true, device: { select: { id: true, name: true } } } } } },
};

router.get("/groups", requirePermission("access-control", "view"), async (_req, res) => {
  res.json(await prisma.accessGroup.findMany({ select: accessGroupSelect, orderBy: { name: "asc" } }));
});

router.post("/groups", requirePermission("access-control", "create"), validateBody(createAccessGroupSchema), async (req, res) => {
  const { personIds, doorIds, ...rest } = req.body;
  const group = await prisma.accessGroup.create({
    data: {
      ...rest,
      members: { create: personIds.map((personId: number) => ({ personId })) },
      doors: { create: doorIds.map((doorId: number) => ({ doorId })) },
    },
    select: accessGroupSelect,
  });
  await logAudit({ userId: req.user!.id, action: "accessGroup.create", entityType: "AccessGroup", entityId: group.id });
  res.status(201).json(group);
});

router.patch("/groups/:id", requirePermission("access-control", "edit"), validateBody(updateAccessGroupSchema), async (req, res) => {
  const id = Number(req.params.id);
  const { personIds, doorIds, ...rest } = req.body;
  const group = await prisma.accessGroup.update({
    where: { id },
    data: {
      ...rest,
      ...(personIds !== undefined ? { members: { deleteMany: {}, create: personIds.map((personId: number) => ({ personId })) } } : {}),
      ...(doorIds !== undefined ? { doors: { deleteMany: {}, create: doorIds.map((doorId: number) => ({ doorId })) } } : {}),
    },
    select: accessGroupSelect,
  });
  await logAudit({ userId: req.user!.id, action: "accessGroup.update", entityType: "AccessGroup", entityId: group.id });
  res.json(group);
});

router.delete("/groups/:id", requirePermission("access-control", "delete"), async (req, res) => {
  await prisma.accessGroup.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "accessGroup.delete", entityType: "AccessGroup", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// Pushes this group's RightPlan (its doors, on its schedule template) to every member's
// UserInfo record on each door's controller — the same createOrUpdateAcsUser call Credentials
// uses, just applied to every person×device pair in the group in one action instead of one at a
// time. Best-effort per pair: one unreachable controller doesn't abort the rest of the group.
router.post("/groups/:id/apply", requirePermission("access-control", "edit"), async (req, res) => {
  const group = await prisma.accessGroup.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      members: { include: { person: { include: { cards: true } } } },
      doors: { include: { door: { include: { device: true } } } },
    },
  });
  if (!group) throw new ApiError(404, "Access group not found");

  const doorsByDevice = new Map<number, { device: (typeof group.doors)[number]["door"]["device"]; doorNumbers: number[] }>();
  for (const gd of group.doors) {
    const entry = doorsByDevice.get(gd.door.deviceId) ?? { device: gd.door.device, doorNumbers: [] };
    entry.doorNumbers.push(gd.door.doorNumber);
    doorsByDevice.set(gd.door.deviceId, entry);
  }

  const results: { personId: number; deviceId: number; ok: boolean; message: string }[] = [];
  for (const member of group.members) {
    for (const [deviceId, { device, doorNumbers }] of doorsByDevice) {
      if (!device.ipAddress) {
        results.push({ personId: member.personId, deviceId, ok: false, message: "Device has no IP address set." });
        continue;
      }
      const employeeNo = String(member.personId);
      const rightPlan = doorNumbers.map((doorNumber) => ({ doorNumber, planTemplateNo: group.planTemplateNo }));
      const provision = await createOrUpdateAcsUser(device.ipAddress, device.port, device.username ?? "", devicePassword(device), {
        employeeNo,
        name: member.person.name,
        validFrom: member.person.validFrom,
        validTo: member.person.validTo,
        rightPlan,
      });
      if (provision.ok && member.person.cards[0]) {
        await enrollCard(device.ipAddress, device.port, device.username ?? "", devicePassword(device), employeeNo, member.person.cards[0].cardNumber).catch(() => undefined);
      }
      results.push({ personId: member.personId, deviceId, ok: provision.ok, message: provision.message });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  await prisma.accessGroup.update({ where: { id: group.id }, data: { lastAppliedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: "accessGroup.apply", entityType: "AccessGroup", entityId: group.id, metadata: { total: results.length, success: successCount } });
  res.json({ ok: results.length === 0 || results.every((r) => r.ok), results, message: `Applied to ${successCount}/${results.length} person-device pair(s).` });
});

export default router;
