import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { detectIotDevice, getIotStatus, IotDeviceLike, needsDetection, setIotBrightness, setIotPower } from "../../lib/iotDeviceApi";
import { detectShelly } from "../../lib/shellyApi";
import { attemptConnect, getCoordinator, listDevices, updateCoordinatorConfig } from "../../lib/zigbeeCoordinator";
import { startLightingDiscovery } from "./lighting.discover.service";
import {
  brightnessSchema,
  createAutomationSchema,
  createDeviceSchema,
  createGroupSchema,
  createSceneSchema,
  discoverSchema,
  moveDeviceSchema,
  powerSchema,
  reorderGroupsSchema,
  updateAutomationSchema,
  updateDeviceIconSchema,
  updateDeviceSchema,
  updateGroupSchema,
  updateSceneSchema,
  updateZigbeeCoordinatorSchema,
} from "./lighting.schema";

const router = Router();
router.use(verifyJwt);

const deviceSelect = {
  id: true,
  name: true,
  protocol: true,
  ipAddress: true,
  port: true,
  gen: true,
  kind: true,
  channel: true,
  onUrl: true,
  offUrl: true,
  statusUrl: true,
  statusOnPath: true,
  icon: true,
  sortOrder: true,
  groupId: true,
  locationId: true,
  location: { select: { id: true, name: true } },
  status: true,
  isOn: true,
  brightness: true,
  powerW: true,
  lastCheckedAt: true,
  createdAt: true,
};

type DeviceRow = Awaited<ReturnType<typeof prisma.lightingDevice.findUniqueOrThrow>>;

function toIotDevice(device: DeviceRow, overrides: Partial<Pick<DeviceRow, "gen" | "kind">> = {}): IotDeviceLike {
  return {
    protocol: device.protocol,
    ipAddress: device.ipAddress,
    port: device.port,
    gen: overrides.gen !== undefined ? overrides.gen : device.gen,
    kind: (overrides.kind !== undefined ? overrides.kind : device.kind) as IotDeviceLike["kind"],
    channel: device.channel,
    onUrl: device.onUrl,
    offUrl: device.offUrl,
    statusUrl: device.statusUrl,
    statusOnPath: device.statusOnPath,
  };
}

// Live-polls one device through the protocol dispatcher (server/src/lib/iotDeviceApi.ts),
// detecting generation/kind on first contact if the driver needs one, and persists the fresh
// reading. Shared by the manual per-device refresh route, the bulk "refresh all" route, and
// every control route (so a power/brightness command always leaves the DB reflecting what the
// device just reported, not just what we asked it to do).
async function refreshDevice(id: number) {
  const device = await prisma.lightingDevice.findUniqueOrThrow({ where: { id } });
  let gen = device.gen;
  let kind = device.kind;

  if (needsDetection(device.protocol, gen, kind)) {
    const detected = await detectIotDevice(toIotDevice(device));
    gen = detected.gen;
    kind = detected.kind;
  }

  const status = await getIotStatus(toIotDevice(device, { gen, kind }));
  if (status === null) {
    // Nothing to poll (a GENERIC_HTTP device with no status URL configured) — persist any
    // freshly-detected gen/kind but otherwise leave isOn/status exactly as the last command left it.
    return prisma.lightingDevice.update({ where: { id }, data: { gen, kind }, select: deviceSelect });
  }

  return prisma.lightingDevice.update({
    where: { id },
    data: {
      gen,
      kind,
      status: "ONLINE",
      isOn: status.on,
      brightness: status.brightness,
      powerW: status.powerW,
      lastCheckedAt: new Date(),
    },
    select: deviceSelect,
  });
}

async function markOffline(id: number) {
  return prisma.lightingDevice.update({
    where: { id },
    data: { status: "OFFLINE", lastCheckedAt: new Date() },
    select: deviceSelect,
  });
}

// A physical Shelly device can have more than one independently-controllable output (a
// Shelly 2PM has 2, a Pro 4PM has 4); each one gets its own LightingDevice row, sharing the
// same IP but a distinct `channel`, since they're switched/dimmed independently. Detects the
// device once up front to learn gen/kind/outputs, so the per-row creation below doesn't need
// a redundant detection pass through refreshDevice(). If the device can't be reached yet, this
// falls back to a single channel-0 row — outputs are only split at add time, not retroactively,
// so a device that was offline when added should be deleted and re-added once reachable to
// pick up its other outputs.
async function createShellyOutputDevices(name: string, ipAddress: string, port: number | null, locationId: number | null) {
  const detection = await detectShelly(ipAddress, port).catch(() => null);
  const outputs = detection?.outputs ?? 1;
  const created = [];
  for (let channel = 0; channel < outputs; channel++) {
    const device = await prisma.lightingDevice.create({
      data: {
        name: outputs > 1 ? `${name} — Output ${channel + 1}` : name,
        protocol: "SHELLY",
        ipAddress,
        port,
        locationId,
        channel,
        gen: detection?.gen ?? null,
        kind: detection?.kind ?? null,
      },
      select: deviceSelect,
    });
    created.push(await refreshDevice(device.id).catch(() => device));
  }
  return created;
}

router.get("/devices", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await prisma.lightingDevice.findMany({ select: deviceSelect, orderBy: { name: "asc" } }));
});

router.post("/devices", requirePermission("lighting", "create"), validateBody(createDeviceSchema), async (req, res) => {
  // A Shelly device may expose more than one output — split into one LightingDevice row per
  // output (see createShellyOutputDevices) instead of always creating exactly one row.
  if (req.body.protocol === "SHELLY") {
    const created = await createShellyOutputDevices(req.body.name, req.body.ipAddress, req.body.port ?? null, req.body.locationId ?? null);
    await logAudit({
      userId: req.user!.id,
      action: "lightingDevice.create",
      entityType: "LightingDevice",
      entityId: created[0].id,
      metadata: { outputs: created.length, deviceIds: created.map((d) => d.id) },
    });
    res.status(201).json(created.length > 1 ? created : created[0]);
    return;
  }

  const device = await prisma.lightingDevice.create({ data: req.body, select: deviceSelect });
  await logAudit({ userId: req.user!.id, action: "lightingDevice.create", entityType: "LightingDevice", entityId: device.id });

  // Best-effort immediate probe so the card shows real status right away instead of sitting
  // at "detecting..." until the next poll cycle — a failure here is fine, the device row is
  // already saved and will simply show as offline (or unpolled, for a status-URL-less
  // GENERIC_HTTP device) until it's reachable.
  const probed = await refreshDevice(device.id).catch(() => null);
  res.status(201).json(probed ?? device);
});

router.patch("/devices/:id", requirePermission("lighting", "edit"), validateBody(updateDeviceSchema), async (req, res) => {
  const device = await prisma.lightingDevice.update({ where: { id: Number(req.params.id) }, data: req.body, select: deviceSelect });
  await logAudit({ userId: req.user!.id, action: "lightingDevice.update", entityType: "LightingDevice", entityId: device.id });
  res.json(device);
});

router.delete("/devices/:id", requirePermission("lighting", "delete"), async (req, res) => {
  await prisma.lightingDevice.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "lightingDevice.delete", entityType: "LightingDevice", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ipAddress and the on/off/status URLs (which are built from it) stay blank on the clone — same
// reasoning as NVR/Camera/AccessControlDevice duplicate. ZigBee pairing fields are also dropped:
// they identify one specific paired radio, not something a "copy" could legitimately inherit.
router.post("/devices/:id/duplicate", requirePermission("lighting", "create"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.lightingDevice.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Lighting device not found");

  const clone = await prisma.lightingDevice.create({
    data: {
      name: `${source.name} (Copy)`,
      protocol: source.protocol,
      kind: source.kind,
      channel: source.channel,
      icon: source.icon,
      groupId: source.groupId,
      locationId: source.locationId,
      status: "UNKNOWN",
    },
    select: deviceSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingDevice.duplicate", entityType: "LightingDevice", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

// Manual per-device refresh (e.g. a "Refresh" affordance on one card).
router.post("/devices/:id/refresh", requirePermission("lighting", "view"), async (req, res) => {
  const id = Number(req.params.id);
  res.json(await refreshDevice(id).catch(() => markOffline(id)));
});

// Bulk refresh, polled by the Lighting page on an interval — mirrors the NVR live-latency
// pattern (a genuine network round trip on a timer, not just a re-read of stale DB rows),
// but batched into one request instead of one per card.
router.post("/devices/refresh-all", requirePermission("lighting", "view"), async (_req, res) => {
  const devices = await prisma.lightingDevice.findMany({ select: { id: true } });
  const results = await Promise.all(devices.map((d) => refreshDevice(d.id).catch(() => markOffline(d.id))));
  res.json(results);
});

router.post("/devices/:id/power", requirePermission("lighting", "edit"), validateBody(powerSchema), async (req, res) => {
  const id = Number(req.params.id);
  const device = await prisma.lightingDevice.findUnique({ where: { id } });
  if (!device) throw new ApiError(404, "Device not found");

  let gen = device.gen;
  let kind = device.kind;
  if (needsDetection(device.protocol, gen, kind)) {
    const detected = await detectIotDevice(toIotDevice(device)).catch(() => null);
    if (!detected) {
      await markOffline(id);
      throw new ApiError(502, `Could not reach ${device.name}.`);
    }
    gen = detected.gen;
    kind = detected.kind;
  }

  try {
    await setIotPower(toIotDevice(device, { gen, kind }), req.body.on);
  } catch (err) {
    await markOffline(id);
    throw new ApiError(502, `Could not control ${device.name}: ${(err as Error).message}`);
  }

  await logAudit({ userId: req.user!.id, action: "lightingDevice.power", entityType: "LightingDevice", entityId: id, metadata: { on: req.body.on } });
  res.json(await refreshDevice(id).catch(() => prisma.lightingDevice.update({ where: { id }, data: { gen, kind, isOn: req.body.on, status: "ONLINE", lastCheckedAt: new Date() }, select: deviceSelect })));
});

router.post("/devices/:id/brightness", requirePermission("lighting", "edit"), validateBody(brightnessSchema), async (req, res) => {
  const id = Number(req.params.id);
  const device = await prisma.lightingDevice.findUnique({ where: { id } });
  if (!device) throw new ApiError(404, "Device not found");

  let gen = device.gen;
  let kind = device.kind;
  if (needsDetection(device.protocol, gen, kind)) {
    const detected = await detectIotDevice(toIotDevice(device)).catch(() => null);
    if (!detected) {
      await markOffline(id);
      throw new ApiError(502, `Could not reach ${device.name}.`);
    }
    gen = detected.gen;
    kind = detected.kind;
  }

  try {
    await setIotBrightness(toIotDevice(device, { gen, kind }), req.body.value);
  } catch (err) {
    await markOffline(id);
    throw new ApiError(502, `Could not control ${device.name}: ${(err as Error).message}`);
  }

  await logAudit({ userId: req.user!.id, action: "lightingDevice.brightness", entityType: "LightingDevice", entityId: id, metadata: { value: req.body.value } });
  res.json(await refreshDevice(id));
});

// ───────────────────────── Discover (LAN scan for local IoT devices) ─────────────────────────
// Same async job + poll pattern as the Network Topology Map's IP Range Scanner: the scan
// starts in the background and this responds immediately with the RUNNING row; the client
// polls GET /discover/:id (which includes results) until status leaves RUNNING. Only Shelly
// and Tasmota devices are auto-discoverable (see lighting.discover.service.ts) — GENERIC_HTTP
// devices have no fixed signal to probe for and are always added manually.

router.post("/discover", requirePermission("lighting", "create"), validateBody(discoverSchema), async (req, res) => {
  const scan = await startLightingDiscovery(req.body.startIp, req.body.endIp).catch((err: Error) => {
    throw new ApiError(400, err.message);
  });
  res.status(201).json(scan);
});

router.get("/discover/:id", requirePermission("lighting", "view"), async (req, res) => {
  const scan = await prisma.lightingScan.findUnique({
    where: { id: Number(req.params.id) },
    include: { results: { orderBy: { ipAddress: "asc" } } },
  });
  if (!scan) throw new ApiError(404, "Scan not found");
  res.json(scan);
});

// Adds every not-yet-added result from one scan in a single call — the "Adopt all" button.
// Best-effort per host: one unreachable-by-the-time-you-click IP doesn't abort the rest.
router.post("/discover/:id/adopt-all", requirePermission("lighting", "create"), async (req, res) => {
  const scan = await prisma.lightingScan.findUnique({ where: { id: Number(req.params.id) }, include: { results: true } });
  if (!scan) throw new ApiError(404, "Scan not found");

  const toAdd = scan.results.filter((r) => !r.alreadyAdded);
  const created = [];
  for (const r of toAdd) {
    if (r.protocol === "SHELLY") {
      const devices = await createShellyOutputDevices(r.name || r.model || r.ipAddress, r.ipAddress, null, null).catch(() => []);
      created.push(...devices);
      continue;
    }
    const device = await prisma.lightingDevice
      .create({ data: { name: r.name || r.model || r.ipAddress, protocol: r.protocol, ipAddress: r.ipAddress, gen: r.gen }, select: deviceSelect })
      .catch(() => null);
    if (!device) continue; // e.g. this IP was already added by a concurrent request
    created.push(await refreshDevice(device.id).catch(() => device));
  }

  await prisma.lightingScanResult.updateMany({ where: { scanId: scan.id }, data: { alreadyAdded: true } });
  await logAudit({ userId: req.user!.id, action: "lightingDevice.adoptAll", entityType: "LightingScan", entityId: scan.id, metadata: { count: created.length } });
  res.json(created);
});

// ───────────────────────── Dashboard: device icon + group placement ─────────────────────────

router.patch("/devices/:id/icon", requirePermission("lighting", "edit"), validateBody(updateDeviceIconSchema), async (req, res) => {
  const device = await prisma.lightingDevice.update({ where: { id: Number(req.params.id) }, data: { icon: req.body.icon }, select: deviceSelect });
  res.json(device);
});

// Drag-and-drop: moves a device into a group (or ungroups it with groupId: null) and/or
// updates its sort position within that group's card.
router.patch("/devices/:id/move", requirePermission("lighting", "edit"), validateBody(moveDeviceSchema), async (req, res) => {
  const device = await prisma.lightingDevice.update({
    where: { id: Number(req.params.id) },
    data: { groupId: req.body.groupId, ...(req.body.sortOrder !== undefined ? { sortOrder: req.body.sortOrder } : {}) },
    select: deviceSelect,
  });
  res.json(device);
});

// ───────────────────────── Groups (Dashboard cards / Areas) ─────────────────────────

router.get("/groups", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await prisma.lightingGroup.findMany({ orderBy: { sortOrder: "asc" } }));
});

router.post("/groups", requirePermission("lighting", "create"), validateBody(createGroupSchema), async (req, res) => {
  const maxSort = await prisma.lightingGroup.aggregate({ _max: { sortOrder: true } });
  const group = await prisma.lightingGroup.create({ data: { ...req.body, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 } });
  await logAudit({ userId: req.user!.id, action: "lightingGroup.create", entityType: "LightingGroup", entityId: group.id });
  res.status(201).json(group);
});

router.patch("/groups/:id", requirePermission("lighting", "edit"), validateBody(updateGroupSchema), async (req, res) => {
  const group = await prisma.lightingGroup.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "lightingGroup.update", entityType: "LightingGroup", entityId: group.id });
  res.json(group);
});

// Drag-and-drop reordering of the group cards themselves — `ids` is the full list of group ids
// in their new left-to-right/top-to-bottom order.
router.post("/groups/reorder", requirePermission("lighting", "edit"), validateBody(reorderGroupsSchema), async (req, res) => {
  await Promise.all(req.body.ids.map((id: number, index: number) => prisma.lightingGroup.update({ where: { id }, data: { sortOrder: index } })));
  res.json({ ok: true });
});

// Master switch for a whole location — turns every device currently in the group on/off in one
// call, distinct from the per-device toggles Manage Locations already had. Runs in parallel and
// is best-effort per device (one unreachable light doesn't block the rest), mirroring
// /devices/refresh-all's Promise.all-over-catch pattern.
router.post("/groups/:id/power", requirePermission("lighting", "edit"), validateBody(powerSchema), async (req, res) => {
  const groupId = Number(req.params.id);
  const devices = await prisma.lightingDevice.findMany({ where: { groupId } });

  const results = await Promise.all(
    devices.map(async (device) => {
      let gen = device.gen;
      let kind = device.kind;
      if (needsDetection(device.protocol, gen, kind)) {
        const detected = await detectIotDevice(toIotDevice(device)).catch(() => null);
        if (!detected) return markOffline(device.id).catch(() => null);
        gen = detected.gen;
        kind = detected.kind;
      }
      try {
        await setIotPower(toIotDevice(device, { gen, kind }), req.body.on);
      } catch {
        return markOffline(device.id).catch(() => null);
      }
      return refreshDevice(device.id).catch(() =>
        prisma.lightingDevice.update({ where: { id: device.id }, data: { gen, kind, isOn: req.body.on, status: "ONLINE", lastCheckedAt: new Date() }, select: deviceSelect })
      );
    })
  );

  await logAudit({ userId: req.user!.id, action: "lightingGroup.power", entityType: "LightingGroup", entityId: groupId, metadata: { on: req.body.on, deviceCount: devices.length } });
  res.json(results.filter(Boolean));
});

router.delete("/groups/:id", requirePermission("lighting", "delete"), async (req, res) => {
  // Ungroup its devices rather than cascading — deleting a card shouldn't delete the lights in it.
  await prisma.lightingDevice.updateMany({ where: { groupId: Number(req.params.id) }, data: { groupId: null } });
  await prisma.lightingGroup.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "lightingGroup.delete", entityType: "LightingGroup", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ───────────────────────── Scenes ─────────────────────────

const sceneSelect = {
  id: true,
  name: true,
  icon: true,
  createdAt: true,
  actions: { select: { id: true, deviceId: true, turnOn: true, brightness: true, device: { select: { id: true, name: true } } } },
};

router.get("/scenes", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await prisma.lightingScene.findMany({ select: sceneSelect, orderBy: { name: "asc" } }));
});

router.post("/scenes", requirePermission("lighting", "create"), validateBody(createSceneSchema), async (req, res) => {
  const { actions, ...rest } = req.body;
  const scene = await prisma.lightingScene.create({ data: { ...rest, actions: { create: actions } }, select: sceneSelect });
  await logAudit({ userId: req.user!.id, action: "lightingScene.create", entityType: "LightingScene", entityId: scene.id });
  res.status(201).json(scene);
});

router.patch("/scenes/:id", requirePermission("lighting", "edit"), validateBody(updateSceneSchema), async (req, res) => {
  const { actions, ...rest } = req.body;
  const scene = await prisma.lightingScene.update({
    where: { id: Number(req.params.id) },
    data: { ...rest, ...(actions !== undefined ? { actions: { deleteMany: {}, create: actions } } : {}) },
    select: sceneSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingScene.update", entityType: "LightingScene", entityId: scene.id });
  res.json(scene);
});

router.delete("/scenes/:id", requirePermission("lighting", "delete"), async (req, res) => {
  await prisma.lightingScene.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "lightingScene.delete", entityType: "LightingScene", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/scenes/:id/duplicate", requirePermission("lighting", "create"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.lightingScene.findUnique({ where: { id }, include: { actions: true } });
  if (!source) throw new ApiError(404, "Scene not found");

  const clone = await prisma.lightingScene.create({
    data: {
      name: `${source.name} (Copy)`,
      icon: source.icon,
      actions: { create: source.actions.map((a) => ({ deviceId: a.deviceId, turnOn: a.turnOn, brightness: a.brightness })) },
    },
    select: sceneSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingScene.duplicate", entityType: "LightingScene", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

// Applies every action in the scene to its device, best-effort per device so one unreachable
// light doesn't block the rest of the scene from activating.
router.post("/scenes/:id/activate", requirePermission("lighting", "edit"), async (req, res) => {
  const scene = await prisma.lightingScene.findUnique({ where: { id: Number(req.params.id) }, include: { actions: { include: { device: true } } } });
  if (!scene) throw new ApiError(404, "Scene not found");

  const results: { deviceId: number; ok: boolean; message: string }[] = [];
  for (const action of scene.actions) {
    const device = action.device;
    let gen = device.gen;
    let kind = device.kind;
    try {
      if (needsDetection(device.protocol, gen, kind)) {
        const detected = await detectIotDevice(toIotDevice(device));
        gen = detected.gen;
        kind = detected.kind;
      }
      await setIotPower(toIotDevice(device, { gen, kind }), action.turnOn);
      if (action.turnOn && action.brightness !== null && device.kind === "LIGHT") {
        await setIotBrightness(toIotDevice(device, { gen, kind }), action.brightness);
      }
      results.push({ deviceId: device.id, ok: true, message: "OK" });
    } catch (err) {
      results.push({ deviceId: device.id, ok: false, message: (err as Error).message });
    }
  }
  await Promise.all(scene.actions.map((a) => refreshDevice(a.deviceId).catch(() => undefined)));

  const successCount = results.filter((r) => r.ok).length;
  await logAudit({ userId: req.user!.id, action: "lightingScene.activate", entityType: "LightingScene", entityId: scene.id, metadata: { total: results.length, success: successCount } });
  res.json({ ok: results.length === 0 || successCount === results.length, results, message: `Applied to ${successCount}/${results.length} device(s).` });
});

// ───────────────────────── Automations ─────────────────────────

const automationSelect = {
  id: true,
  name: true,
  isEnabled: true,
  daysOfWeek: true,
  timeOfDay: true,
  actionType: true,
  actions: { select: { id: true, deviceId: true, turnOn: true, brightness: true, device: { select: { id: true, name: true } } } },
  targetSceneId: true,
  targetScene: { select: { id: true, name: true } },
  offTimeOfDay: true,
  lastRunDate: true,
  createdAt: true,
};

router.get("/automations", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await prisma.lightingAutomation.findMany({ select: automationSelect, orderBy: { timeOfDay: "asc" } }));
});

router.post("/automations", requirePermission("lighting", "create"), validateBody(createAutomationSchema), async (req, res) => {
  const { actions, ...rest } = req.body;
  const automation = await prisma.lightingAutomation.create({
    data: { ...rest, ...(actions ? { actions: { create: actions } } : {}) },
    select: automationSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingAutomation.create", entityType: "LightingAutomation", entityId: automation.id });
  res.status(201).json(automation);
});

router.patch("/automations/:id", requirePermission("lighting", "edit"), validateBody(updateAutomationSchema), async (req, res) => {
  const { actions, ...rest } = req.body;
  const automation = await prisma.lightingAutomation.update({
    where: { id: Number(req.params.id) },
    data: { ...rest, ...(actions !== undefined ? { actions: { deleteMany: {}, create: actions } } : {}) },
    select: automationSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingAutomation.update", entityType: "LightingAutomation", entityId: automation.id });
  res.json(automation);
});

router.delete("/automations/:id", requirePermission("lighting", "delete"), async (req, res) => {
  await prisma.lightingAutomation.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "lightingAutomation.delete", entityType: "LightingAutomation", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/automations/:id/duplicate", requirePermission("lighting", "create"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.lightingAutomation.findUnique({ where: { id }, include: { actions: true } });
  if (!source) throw new ApiError(404, "Automation not found");

  const clone = await prisma.lightingAutomation.create({
    data: {
      name: `${source.name} (Copy)`,
      isEnabled: source.isEnabled,
      daysOfWeek: source.daysOfWeek,
      timeOfDay: source.timeOfDay,
      actionType: source.actionType,
      offTimeOfDay: source.offTimeOfDay,
      targetSceneId: source.targetSceneId,
      // lastRunDate/lastRunDateOff are intentionally left unset — a duplicate hasn't fired yet.
      ...(source.actionType === "DEVICE"
        ? { actions: { create: source.actions.map((a) => ({ deviceId: a.deviceId, turnOn: a.turnOn, brightness: a.brightness })) } }
        : {}),
    },
    select: automationSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingAutomation.duplicate", entityType: "LightingAutomation", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

// Paginated history of every time the scheduler actually fired an automation — see
// LightingAutomationRun in schema.prisma. Distinct from the automation list's single
// lastRunDate/lastRunDateOff dedup strings, which only ever remember "the last date", not what
// happened or whether every device actually responded.
router.get("/automations/runs", requirePermission("lighting", "view"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const [runs, total] = await Promise.all([
    prisma.lightingAutomationRun.findMany({
      orderBy: { ranAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lightingAutomationRun.count(),
  ]);
  res.json({ runs, total, page, pageSize });
});

// ───────────────────────── Dashboard summary ─────────────────────────
// Backs the redesigned Dashboard tab's stat row/bar chart with real data only — this app has no
// climate or solar-panel integration, so there is no "indoor temp"/"solar energy" to report; the
// closest honest analog to a day-by-day usage chart is counting real power.toggle audit events.

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

router.get("/dashboard-summary", requirePermission("lighting", "view"), async (_req, res) => {
  const [devices, groups, automationsActiveCount] = await Promise.all([
    prisma.lightingDevice.findMany({ select: { id: true, isOn: true, powerW: true, groupId: true } }),
    prisma.lightingGroup.findMany({ select: { id: true, name: true, icon: true }, orderBy: { sortOrder: "asc" } }),
    prisma.lightingAutomation.count({ where: { isEnabled: true } }),
  ]);

  const devicesOn = devices.filter((d) => d.isOn).length;
  const totalPowerW = devices.reduce((sum, d) => sum + (d.isOn ? d.powerW ?? 0 : 0), 0);
  const devicesPerRoom = groups.map((g) => ({
    roomId: g.id,
    roomName: g.name,
    icon: g.icon,
    deviceCount: devices.filter((d) => d.groupId === g.id).length,
    devicesOn: devices.filter((d) => d.groupId === g.id && d.isOn).length,
  }));

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);
  const logs = await prisma.auditLog.findMany({
    where: { action: "lightingDevice.power", createdAt: { gte: since } },
    select: { createdAt: true, metadata: true },
  });
  const activityByDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    return { day: DAY_LABELS[d.getDay()], count: 0 };
  });
  for (const log of logs) {
    if ((log.metadata as { on?: boolean } | null)?.on !== true) continue;
    const idx = Math.floor((log.createdAt.getTime() - since.getTime()) / 86_400_000);
    if (idx >= 0 && idx < 7) activityByDay[idx].count += 1;
  }

  res.json({
    totalDevices: devices.length,
    devicesOn,
    totalPowerW: Math.round(totalPowerW * 10) / 10,
    roomsCount: groups.length,
    automationsActiveCount,
    devicesPerRoom,
    activityByDay,
  });
});

// ───────────────────────── ZigBee (scaffold — see server/src/lib/zigbeeCoordinator.ts) ─────────────────────────

router.get("/zigbee/coordinator", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await getCoordinator("LIGHTING"));
});

router.patch("/zigbee/coordinator", requirePermission("lighting", "edit"), validateBody(updateZigbeeCoordinatorSchema), async (req, res) => {
  res.json(await updateCoordinatorConfig("LIGHTING", req.body.serialPort));
});

router.post("/zigbee/coordinator/connect", requirePermission("lighting", "edit"), async (_req, res) => {
  res.json(await attemptConnect("LIGHTING"));
});

router.get("/zigbee/devices", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await listDevices("LIGHTING"));
});

export default router;
