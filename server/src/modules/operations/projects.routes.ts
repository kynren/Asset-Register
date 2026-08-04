import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { notifyUsers } from "../../lib/notify";
import { RECORD_ACCESS_BYPASS_ROLE_NAMES, grantRecordAccess, hasRecordAccess, listRecordAccess, listRecordAccessBatch, revokeRecordAccess } from "../../lib/recordAccess";

const router = Router();
router.use(verifyJwt);

const ENTITY_TYPE = "ProjectCard";

const cardSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  assigneeId: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
  dueDate: true,
  order: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  attachments: {
    select: { id: true, kind: true, fileName: true, url: true, mimeType: true, sizeBytes: true, uploadedById: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
};

// Only the creator is ever notified, and only when someone else made the change — the JWT payload
// only carries id/roleId/roleName (see middleware/auth.ts), so the acting editor's display name is
// looked up here rather than trusted from the token. `summary` is the full past-tense clause
// describing what happened, e.g. `updated your project "X"` or `moved your project "X" to Done`.
async function notifyCreatorOfUpdate(creatorId: number, actingUserId: number, projectTitle: string, buildSummary: (editorName: string) => string) {
  if (actingUserId === creatorId) return;
  const actingUser = await prisma.user.findUnique({ where: { id: actingUserId }, select: { firstName: true, lastName: true } });
  const editorName = actingUser ? `${actingUser.firstName} ${actingUser.lastName}` : "Someone";
  const summary = buildSummary(editorName);
  const projectUrl = `${env.CLIENT_ORIGIN}/operations`;
  await notifyUsers({
    userIds: [creatorId],
    kind: "PROJECT_UPDATED",
    type: "project_updated",
    message: summary,
    linkUrl: "/operations",
    email: {
      eventType: "PROJECT_UPDATED",
      fallbackSubject: summary,
      fallbackText: `${summary}.\n\nView it here: ${projectUrl}`,
      variables: { editorName, projectTitle, projectUrl },
    },
  });
}

router.get("/", requirePermission("operations", "view"), async (_req, res) => {
  const cards = await prisma.projectCard.findMany({ select: cardSelect, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  const accessByCard = await listRecordAccessBatch(ENTITY_TYPE, cards.map((c) => c.id));
  res.json(cards.map((c) => ({ ...c, access: accessByCard.get(c.id) ?? [] })));
});

const accessGrantSchema = z
  .object({ userId: z.number().int().optional(), teamId: z.number().int().optional(), level: z.enum(["EDIT", "DELETE"]) })
  .refine((v) => (v.userId != null) !== (v.teamId != null), { message: "Provide exactly one of userId or teamId" });

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // Access to grant other users at creation time — the creator always has full access already,
  // so this is purely additive (satisfies "whenever a user is creating an entry they should be
  // given the option to give other users edit, delete access").
  access: z.array(accessGrantSchema).optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(createSchema), async (req, res) => {
  const { access, ...data } = req.body as z.infer<typeof createSchema>;
  const card = await prisma.projectCard.create({ data: { ...data, createdById: req.user!.id }, select: cardSelect });

  for (const grant of access ?? []) {
    const target = grant.userId != null ? { userId: grant.userId } : { teamId: grant.teamId! };
    await grantRecordAccess(ENTITY_TYPE, card.id, target, grant.level, req.user!.id);
  }

  await logAudit({ userId: req.user!.id, action: "operations.project.create", entityType: "ProjectCard", entityId: card.id });
  res.status(201).json({ ...card, access: await listRecordAccess(ENTITY_TYPE, card.id) });
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]).optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  order: z.number().int().optional(),
});

// Editing is restricted to the creator, System Admin, and anyone explicitly granted EDIT access
// (see server/src/lib/recordAccess.ts) — requirePermission("operations","edit") still gates
// whether the user's role can touch project cards at all, but that alone isn't sufficient: it
// only proves the user *could* edit some card, not *this* one.
router.patch("/:id", requirePermission("operations", "edit"), validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.projectCard.findUnique({ where: { id }, select: { id: true, title: true, createdById: true } });
  if (!existing) throw new ApiError(404, "Project card not found");

  const canEdit = await hasRecordAccess(ENTITY_TYPE, id, existing, req.user!.id, req.user!.roleName, "EDIT");
  if (!canEdit) throw new ApiError(403, "Only the project's creator or someone they've granted edit access to can update this project");

  const card = await prisma.projectCard.update({ where: { id }, data: req.body, select: cardSelect });
  await logAudit({ userId: req.user!.id, action: "operations.project.update", entityType: "ProjectCard", entityId: id, metadata: req.body });
  await notifyCreatorOfUpdate(existing.createdById, req.user!.id, card.title, (editorName) => `${editorName} updated your project "${card.title}"`);

  res.json({ ...card, access: await listRecordAccess(ENTITY_TYPE, id) });
});

// Kept as a thin alias of the general PATCH so the drag-and-drop board (which only ever changes
// status + order) doesn't need to know the full update schema.
const statusSchema = z.object({ status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]), order: z.number().int().optional() });
router.patch("/:id/status", requirePermission("operations", "edit"), validateBody(statusSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.projectCard.findUnique({ where: { id }, select: { id: true, title: true, createdById: true } });
  if (!existing) throw new ApiError(404, "Project card not found");

  const canEdit = await hasRecordAccess(ENTITY_TYPE, id, existing, req.user!.id, req.user!.roleName, "EDIT");
  if (!canEdit) throw new ApiError(403, "Only the project's creator or someone they've granted edit access to can move this project");

  const card = await prisma.projectCard.update({ where: { id }, data: req.body, select: cardSelect });
  await logAudit({ userId: req.user!.id, action: "operations.project.move", entityType: "ProjectCard", entityId: id, metadata: { status: req.body.status } });
  await notifyCreatorOfUpdate(
    existing.createdById,
    req.user!.id,
    card.title,
    (editorName) => `${editorName} moved your project "${card.title}" to ${req.body.status.replace("_", " ")}`
  );

  res.json({ ...card, access: await listRecordAccess(ENTITY_TYPE, id) });
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const card = await prisma.projectCard.findUnique({ where: { id } });
  if (!card) throw new ApiError(404, "Project card not found");

  const canDelete = await hasRecordAccess(ENTITY_TYPE, id, card, req.user!.id, req.user!.roleName, "DELETE");
  if (!canDelete) {
    throw new ApiError(403, "Only the project's creator, someone they've granted delete access to, or a System/Super Admin can delete this project");
  }

  await prisma.recordAccessGrant.deleteMany({ where: { entityType: ENTITY_TYPE, entityId: id } });
  await prisma.projectCard.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.project.delete", entityType: "ProjectCard", entityId: id });
  res.json({ ok: true });
});

// ───────────────────────── Access grants (creator-only grant/revoke, EDIT or DELETE) ─────────────────────────

router.post("/:id/access", requirePermission("operations", "edit"), validateBody(accessGrantSchema), async (req, res) => {
  const id = Number(req.params.id);
  const card = await prisma.projectCard.findUnique({ where: { id } });
  if (!card) throw new ApiError(404, "Project card not found");
  if (card.createdById !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only the project's creator can grant access");
  }

  const target = req.body.userId != null ? { userId: req.body.userId } : { teamId: req.body.teamId };
  await grantRecordAccess(ENTITY_TYPE, id, target, req.body.level, req.user!.id);
  await logAudit({ userId: req.user!.id, action: "operations.project.access.grant", entityType: "ProjectCard", entityId: id, metadata: req.body });
  res.json(await listRecordAccess(ENTITY_TYPE, id));
});

router.delete("/:id/access/:kind/:targetId/:level", requirePermission("operations", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const level = req.params.level === "DELETE" ? "DELETE" : "EDIT";
  const target = req.params.kind === "team" ? { teamId: targetId } : { userId: targetId };
  const card = await prisma.projectCard.findUnique({ where: { id } });
  if (!card) throw new ApiError(404, "Project card not found");
  if (card.createdById !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only the project's creator can revoke access");
  }

  await revokeRecordAccess(ENTITY_TYPE, id, target, level);
  await logAudit({ userId: req.user!.id, action: "operations.project.access.revoke", entityType: "ProjectCard", entityId: id, metadata: { ...target, level } });
  res.json(await listRecordAccess(ENTITY_TYPE, id));
});

// ───────────────────────── Attachments (image / video / audio / file) ─────────────────────────

export const PROJECT_ATTACHMENT_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "projects");
fs.mkdirSync(PROJECT_ATTACHMENT_ROOT, { recursive: true });

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(PROJECT_ATTACHMENT_ROOT, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function kindForMimeType(mimeType: string): "IMAGE" | "VIDEO" | "AUDIO" | "FILE" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

router.post("/:id/attachments", requirePermission("operations", "edit"), attachmentUpload.single("file"), async (req, res) => {
  const id = Number(req.params.id);
  const card = await prisma.projectCard.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!card) throw new ApiError(404, "Project card not found");
  const canEdit = await hasRecordAccess(ENTITY_TYPE, id, card, req.user!.id, req.user!.roleName, "EDIT");
  if (!canEdit) throw new ApiError(403, "Only the project's creator or someone they've granted edit access to can add attachments");
  if (!req.file) throw new ApiError(400, "No file uploaded");

  const attachment = await prisma.projectCardAttachment.create({
    data: {
      projectCardId: id,
      kind: kindForMimeType(req.file.mimetype),
      fileName: req.file.originalname,
      url: `/uploads/projects/${id}/${req.file.filename}`,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedById: req.user!.id,
    },
  });
  await logAudit({ userId: req.user!.id, action: "operations.project.attachment.add", entityType: "ProjectCard", entityId: id, metadata: { attachmentId: attachment.id } });
  res.status(201).json(attachment);
});

router.delete("/:id/attachments/:attachmentId", requirePermission("operations", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const card = await prisma.projectCard.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!card) throw new ApiError(404, "Project card not found");
  const canEdit = await hasRecordAccess(ENTITY_TYPE, id, card, req.user!.id, req.user!.roleName, "EDIT");
  if (!canEdit) throw new ApiError(403, "Only the project's creator or someone they've granted edit access to can remove attachments");

  const attachment = await prisma.projectCardAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.projectCardId !== id) throw new ApiError(404, "Attachment not found");

  await prisma.projectCardAttachment.delete({ where: { id: attachmentId } });
  const filePath = path.join(PROJECT_ATTACHMENT_ROOT, String(id), path.basename(attachment.url));
  fs.rm(filePath, { force: true }, () => undefined);
  await logAudit({ userId: req.user!.id, action: "operations.project.attachment.remove", entityType: "ProjectCard", entityId: id, metadata: { attachmentId } });
  res.json({ ok: true });
});

// ───────────────────────── Status colors (Super Admin / System Admin customizable) ─────────────────────────

const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
const STATUS_COLORS_KEY = "operations.projectStatusColors";
const DEFAULT_STATUS_COLORS: Record<(typeof STATUSES)[number], string> = {
  TODO: "#64748b",
  IN_PROGRESS: "#2563eb",
  REVIEW: "#d97706",
  DONE: "#16a34a",
};
const STATUS_ADMIN_ROLE_NAMES = ["System Admin", "Super Admin"];

router.get("/status-colors", requirePermission("operations", "view"), async (_req, res) => {
  const setting = await prisma.systemSetting.findUnique({ where: { key: STATUS_COLORS_KEY } });
  const stored = setting ? (JSON.parse(setting.value) as Partial<typeof DEFAULT_STATUS_COLORS>) : {};
  res.json({ ...DEFAULT_STATUS_COLORS, ...stored });
});

const statusColorsSchema = z.object({
  TODO: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  IN_PROGRESS: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  REVIEW: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  DONE: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

router.put("/status-colors", requirePermission("operations", "view"), validateBody(statusColorsSchema), async (req, res) => {
  if (!STATUS_ADMIN_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only a System Admin or Super Admin can customize project status colors");
  }
  const value = JSON.stringify(req.body);
  await prisma.systemSetting.upsert({ where: { key: STATUS_COLORS_KEY }, update: { value }, create: { key: STATUS_COLORS_KEY, value } });
  await logAudit({ userId: req.user!.id, action: "operations.project.statusColors.update", metadata: req.body });
  res.json(req.body);
});

export { STATUSES };
export default router;
