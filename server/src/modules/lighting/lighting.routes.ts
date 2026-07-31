import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { detectIotDevice, getIotStatus, IotDeviceLike, needsDetection, setIotBrightness, setIotPower } from "../../lib/iotDeviceApi";
import { startLightingDiscovery } from "./lighting.discover.service";
import { brightnessSchema, createDeviceSchema, discoverSchema, powerSchema, updateDeviceSchema } from "./lighting.schema";

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

router.get("/devices", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await prisma.lightingDevice.findMany({ select: deviceSelect, orderBy: { name: "asc" } }));
});

router.post("/devices", requirePermission("lighting", "create"), validateBody(createDeviceSchema), async (req, res) => {
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

export default router;
