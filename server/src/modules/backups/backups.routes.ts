import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { encryptSecret } from "../../lib/crypto";
import { testDestinationConnection } from "../../lib/backupService";
import { runBackupNow } from "../../lib/backupRunner";
import { createBackupDestinationSchema, updateBackupDestinationSchema, updateBackupSettingsSchema } from "./backups.schema";
import { applyBackupSettings } from "./backups.service";

const router = Router();
router.use(verifyJwt);

// ───────────────────────── Schedule ─────────────────────────

router.get("/settings", requirePermission("app-settings","view"), async (_req, res) => {
  const settings = await prisma.backupSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  res.json(settings);
});

router.put("/settings", requirePermission("app-settings","edit"), validateBody(updateBackupSettingsSchema), async (req, res) => {
  res.json(await applyBackupSettings(req.body, req.user!.id));
});

// ───────────────────────── Destinations ─────────────────────────

const destinationSelect = {
  id: true,
  type: true,
  name: true,
  isEnabled: true,
  emailTo: true,
  s3Endpoint: true,
  s3Region: true,
  s3Bucket: true,
  s3AccessKeyId: true,
  s3PathPrefix: true,
  s3ForcePathStyle: true,
  lastTestAt: true,
  lastTestOk: true,
  lastTestMessage: true,
  createdAt: true,
  updatedAt: true,
};

router.get("/destinations", requirePermission("app-settings","view"), async (_req, res) => {
  res.json(await prisma.backupDestination.findMany({ select: destinationSelect, orderBy: { createdAt: "asc" } }));
});

router.post("/destinations", requirePermission("app-settings","create"), validateBody(createBackupDestinationSchema), async (req, res) => {
  const { s3SecretAccessKey, ...rest } = req.body as typeof req.body & { s3SecretAccessKey?: string };
  const destination = await prisma.backupDestination.create({
    data: { ...rest, ...(s3SecretAccessKey ? { s3SecretAccessKey: encryptSecret(s3SecretAccessKey) } : {}) },
    select: destinationSelect,
  });
  await logAudit({ userId: req.user!.id, action: "backups.destination_create", entityType: "BackupDestination", entityId: destination.id });
  res.status(201).json(destination);
});

router.patch("/destinations/:id", requirePermission("app-settings","edit"), validateBody(updateBackupDestinationSchema), async (req, res) => {
  const { s3SecretAccessKey, ...rest } = req.body as typeof req.body & { s3SecretAccessKey?: string };
  const destination = await prisma.backupDestination.update({
    where: { id: Number(req.params.id) },
    data: { ...rest, ...(s3SecretAccessKey ? { s3SecretAccessKey: encryptSecret(s3SecretAccessKey) } : {}) },
    select: destinationSelect,
  });
  await logAudit({ userId: req.user!.id, action: "backups.destination_update", entityType: "BackupDestination", entityId: destination.id });
  res.json(destination);
});

router.delete("/destinations/:id", requirePermission("app-settings","delete"), async (req, res) => {
  await prisma.backupDestination.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "backups.destination_delete", entityType: "BackupDestination", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// Writes and then deletes a real object (S3) or sends a real message (email) — see
// lib/backupService.ts for why a lighter "can we reach the endpoint" check isn't enough here.
router.post("/destinations/:id/test", requirePermission("app-settings","edit"), async (req, res) => {
  const id = Number(req.params.id);
  const destination = await prisma.backupDestination.findUnique({ where: { id } });
  if (!destination) throw new ApiError(404, "Destination not found");

  const result = await testDestinationConnection(destination);
  const updated = await prisma.backupDestination.update({
    where: { id },
    data: { lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message },
    select: destinationSelect,
  });
  await logAudit({ userId: req.user!.id, action: "backups.destination_test", entityType: "BackupDestination", entityId: id, metadata: { ok: result.ok } });
  res.json({ ok: result.ok, message: result.message, destination: updated });
});

// ───────────────────────── Runs ─────────────────────────

router.get("/runs", requirePermission("app-settings","view"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const [runs, total] = await Promise.all([
    prisma.backupRun.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { deliveries: true },
    }),
    prisma.backupRun.count(),
  ]);
  res.json({ runs, total, page, pageSize });
});

// Fire-and-forget — a real pg_dump + upload can take well beyond a normal request timeout, so
// this returns immediately and the client polls GET /runs to watch the result land, same pattern
// as the network monitor's manual "Run Now".
router.post("/run-now", requirePermission("app-settings","create"), async (req, res) => {
  runBackupNow("MANUAL").catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Manual backup run failed:", err);
  });
  await logAudit({ userId: req.user!.id, action: "backups.run_now", entityType: "BackupRun" });
  res.status(202).json({ started: true });
});

export default router;
