import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const schema = z.object({ name: z.string().min(1), address: z.string().optional() });

router.get("/", requirePermission("assets", "view"), async (_req, res) => {
  res.json(await prisma.location.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const location = await prisma.location.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "location.create", entityType: "Location", entityId: location.id });
  res.status(201).json(location);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const location = await prisma.location.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "location.update", entityType: "Location", entityId: location.id });
  res.json(location);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.location.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "location.delete", entityType: "Location", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
