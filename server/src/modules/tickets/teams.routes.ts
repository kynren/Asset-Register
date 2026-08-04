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
  userIds: z.array(z.number().int()).default([]),
});

const include = { members: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } };

// List is gated by "helpdesk" view (not "admin") — every staff member who can see tickets needs
// this to populate the "Assigned Team" dropdown on the ticket form, not just admins.
router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.team.findMany({ include, orderBy: { name: "asc" } }));
});

// Unlike the list above, this is open to any authenticated user regardless of module permissions —
// mirrors GET /users/directory, which every "give other users/teams access" picker app-wide needs
// (a Docs or IT Projects user may have no helpdesk access at all, but still needs to see team names
// to grant a team access to something they created).
router.get("/directory", async (_req, res) => {
  res.json(await prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const { name, userIds } = req.body as z.infer<typeof schema>;
  const team = await prisma.team.create({
    data: { name, members: { create: userIds.map((userId) => ({ userId })) } },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "team.create", entityType: "Team", entityId: team.id });
  res.status(201).json(team);
});

// CSV columns: Name (required). Members aren't settable via CSV — add them via Edit afterward.
router.post("/import", requirePermission("admin", "import"), upload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const result = await importCsvRows(req.file.buffer, async (row) => {
    const name = (row.Name ?? row.name ?? "").trim();
    if (!name) throw new Error("Missing Name");
    const team = await prisma.team.create({ data: { name } });
    await logAudit({ userId: req.user!.id, action: "team.create", entityType: "Team", entityId: team.id });
  });
  res.json(result);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const id = Number(req.params.id);
  const { name, userIds } = req.body as z.infer<typeof schema>;

  const team = await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id }, data: { name } });
    await tx.teamMember.deleteMany({ where: { teamId: id } });
    if (userIds.length > 0) {
      await tx.teamMember.createMany({ data: userIds.map((userId) => ({ teamId: id, userId })) });
    }
    return tx.team.findUniqueOrThrow({ where: { id }, include });
  });

  await logAudit({ userId: req.user!.id, action: "team.update", entityType: "Team", entityId: id });
  res.json(team);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) throw new ApiError(404, "Team not found");

  await prisma.team.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "team.delete", entityType: "Team", entityId: id });
  res.json({ ok: true });
});

export default router;
