import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";
import { ApiError } from "../../middleware/errorHandler";
import { importCsvRows } from "../../lib/csvImport";

const router = Router();
router.use(verifyJwt);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const schema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().nullable().optional(),
  defaultTemplateId: z.number().int().nullable().optional(),
  defaultSlaId: z.number().int().nullable().optional(),
});

const include = {
  parent: { select: { id: true, name: true } },
  children: { select: { id: true, name: true } },
  defaultTemplate: { select: { id: true, name: true } },
  defaultSla: { select: { id: true, name: true } },
};

router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.ticketCategory.findMany({ include, orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const category = await prisma.ticketCategory.create({ data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.create", entityType: "TicketCategory", entityId: category.id });
  res.status(201).json(category);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema.partial()), async (req, res) => {
  const category = await prisma.ticketCategory.update({ where: { id: Number(req.params.id) }, data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.update", entityType: "TicketCategory", entityId: category.id });
  res.json(category);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.ticketCategory.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.delete", entityType: "TicketCategory", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// CSV columns: Name (required). Parent/template/SLA links aren't settable via CSV — edit those
// individually afterward, same as a freshly-created category via the form.
router.post("/import", requirePermission("admin", "import"), upload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const result = await importCsvRows(req.file.buffer, async (row) => {
    const name = (row.Name ?? row.name ?? "").trim();
    if (!name) throw new Error("Missing Name");
    const category = await prisma.ticketCategory.create({ data: { name } });
    await logAudit({ userId: req.user!.id, action: "ticketCategory.create", entityType: "TicketCategory", entityId: category.id });
  });
  res.json(result);
});

router.post("/:id/duplicate", requirePermission("admin", "duplicate"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.ticketCategory.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Ticket category not found");

  let newName = `${source.name} (Copy)`;
  let suffix = 1;
  while (await prisma.ticketCategory.findUnique({ where: { name: newName } })) {
    suffix += 1;
    newName = `${source.name} (Copy ${suffix})`;
  }

  const clone = await prisma.ticketCategory.create({ data: { name: newName } });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.duplicate", entityType: "TicketCategory", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

export default router;
