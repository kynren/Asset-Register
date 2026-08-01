import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { decryptVaultSecret, encryptVaultSecret } from "../../lib/crypto";
import { logAudit } from "../../lib/auditLogger";
import { createVaultEntrySchema, updateVaultEntrySchema } from "./vault.schema";

const router = Router();
router.use(verifyJwt);

const listSelect = {
  id: true,
  title: true,
  websiteUrl: true,
  username: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

router.get("/", requirePermission("password", "view"), async (req, res) => {
  const entries = await prisma.vaultEntry.findMany({
    where: { userId: req.user!.id },
    select: listSelect,
    orderBy: { title: "asc" },
  });
  res.json(entries);
});

router.post("/", requirePermission("password", "create"), validateBody(createVaultEntrySchema), async (req, res) => {
  const { password, ...rest } = req.body;
  const entry = await prisma.vaultEntry.create({
    data: { ...rest, userId: req.user!.id, encryptedPassword: encryptVaultSecret(password) },
    select: listSelect,
  });
  await logAudit({ userId: req.user!.id, action: "vault.create", entityType: "VaultEntry", entityId: entry.id });
  res.status(201).json(entry);
});

router.patch("/:id", requirePermission("password", "edit"), validateBody(updateVaultEntrySchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.vaultEntry.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user!.id) throw new ApiError(404, "Vault entry not found");

  const { password, ...rest } = req.body;
  const entry = await prisma.vaultEntry.update({
    where: { id },
    data: { ...rest, ...(password ? { encryptedPassword: encryptVaultSecret(password) } : {}) },
    select: listSelect,
  });
  await logAudit({ userId: req.user!.id, action: "vault.update", entityType: "VaultEntry", entityId: id });
  res.json(entry);
});

router.delete("/:id", requirePermission("password", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.vaultEntry.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user!.id) throw new ApiError(404, "Vault entry not found");

  await prisma.vaultEntry.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "vault.delete", entityType: "VaultEntry", entityId: id });
  res.json({ ok: true });
});

router.post("/:id/reveal", requirePermission("password", "view"), async (req, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.vaultEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== req.user!.id) throw new ApiError(404, "Vault entry not found");

  const password = decryptVaultSecret(entry.encryptedPassword);
  await logAudit({ userId: req.user!.id, action: "vault.reveal", entityType: "VaultEntry", entityId: id });
  res.json({ password });
});

export default router;
