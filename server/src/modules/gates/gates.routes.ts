import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { encryptSecret } from "../../lib/crypto";
import { discoverNet2Servers, testNet2Connection } from "./gates.service";
import { createNet2ServerSchema, discoverNet2Schema, updateNet2ServerSchema } from "./gates.schema";

const router = Router();
router.use(verifyJwt);

const select = {
  id: true,
  name: true,
  ipAddress: true,
  port: true,
  clientId: true,
  username: true,
  notes: true,
  status: true,
  lastCheckedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

// Never send the stored credential back to the client — only whether one is on file, so the edit
// form can show "Password saved" instead of a blank field without ever round-tripping the secret.
function toResponse(server: any) {
  return { ...server, hasPassword: Boolean(server.encryptedPassword) };
}

router.get("/servers", requirePermission("gates", "view"), async (_req, res) => {
  const servers = await prisma.net2Server.findMany({ select: { ...select, encryptedPassword: true }, orderBy: { name: "asc" } });
  res.json(servers.map(toResponse));
});

router.post("/servers", requirePermission("gates", "create"), validateBody(createNet2ServerSchema), async (req, res) => {
  const { password, ...rest } = req.body as ReturnType<typeof createNet2ServerSchema.parse>;
  const server = await prisma.net2Server.create({
    data: { ...rest, encryptedPassword: password ? encryptSecret(password) : null, createdById: req.user!.id },
    select: { ...select, encryptedPassword: true },
  });
  await logAudit({ userId: req.user!.id, action: "gates.server.create", entityType: "Net2Server", entityId: server.id, metadata: { name: server.name, ipAddress: server.ipAddress } });
  res.status(201).json(toResponse(server));
});

router.patch("/servers/:id", requirePermission("gates", "edit"), validateBody(updateNet2ServerSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.net2Server.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Net2 server not found");

  const { password, ...rest } = req.body as ReturnType<typeof updateNet2ServerSchema.parse>;
  const server = await prisma.net2Server.update({
    where: { id },
    data: { ...rest, ...(password !== undefined ? { encryptedPassword: password ? encryptSecret(password) : null } : {}) },
    select: { ...select, encryptedPassword: true },
  });
  await logAudit({ userId: req.user!.id, action: "gates.server.update", entityType: "Net2Server", entityId: server.id, metadata: { name: server.name } });
  res.json(toResponse(server));
});

router.delete("/servers/:id", requirePermission("gates", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.net2Server.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Net2 server not found");
  await prisma.net2Server.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "gates.server.delete", entityType: "Net2Server", entityId: id, metadata: { name: existing.name } });
  res.json({ ok: true });
});

// Best-effort reachability check only — a successful TCP connect confirms *something* is
// listening on the configured port, not that it's actually a Net2 server or that the stored
// credentials are valid. Full API verification needs a real Net2 Local Web API license/server to
// test against, which wasn't available while building this (see research notes on task #528).
router.post("/servers/:id/test-connection", requirePermission("gates", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const server = await prisma.net2Server.findUnique({ where: { id } });
  if (!server) throw new ApiError(404, "Net2 server not found");

  const reachable = await testNet2Connection(server.ipAddress, server.port);
  const updated = await prisma.net2Server.update({
    where: { id },
    data: { status: reachable ? "ONLINE" : "OFFLINE", lastCheckedAt: new Date() },
    select: { ...select, encryptedPassword: true },
  });
  res.json(toResponse(updated));
});

// IP-range discovery — Net2's Local Web API / Net2 Web API listen on 8443 (secure) or 8080
// (plain HTTP) by default and have no documented broadcast/UDP discovery protocol, so this probes
// those two ports across the given range via TCP connect, the same approach the Network Topology
// Map's IP Range Scanner already uses for its own port sweep. Runs directly against the target
// range from the server process — unlike the network module's scans, this isn't relay-aware, so on
// a VPS deployment with no LAN route to the gate controller it will simply find nothing.
router.post("/discover", requirePermission("gates", "view"), validateBody(discoverNet2Schema), async (req, res) => {
  const { startIp, endIp } = req.body as { startIp: string; endIp: string };
  try {
    const candidates = await discoverNet2Servers(startIp, endIp);
    res.json({ candidates });
  } catch (err: any) {
    throw new ApiError(400, err.message || "Could not scan that range");
  }
});

export default router;
