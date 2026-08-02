import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";

const BRANDING_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "branding");
fs.mkdirSync(BRANDING_UPLOAD_ROOT, { recursive: true });

const brandingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BRANDING_UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("admin", "view"), async (_req, res) => {
  const settings = await prisma.systemSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});

const updateSchema = z.object({ values: z.record(z.string()) });

router.put("/", requirePermission("admin", "edit"), validateBody(updateSchema), async (req, res) => {
  const { values } = req.body as { values: Record<string, string> };
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  );
  await logAudit({ userId: req.user!.id, action: "settings.update", metadata: values });
  res.json({ ok: true });
});

const brandingTypeSchema = z.object({ type: z.enum(["appIcon", "favicon"]) });

router.post("/branding", requirePermission("admin", "edit"), brandingUpload.single("file"), async (req, res) => {
  const parsed = brandingTypeSchema.safeParse(req.body);
  if (!parsed.success || !req.file) throw new ApiError(400, "Missing file or type");

  const key = parsed.data.type === "appIcon" ? "appIconUrl" : "faviconUrl";
  const url = `/uploads/branding/${req.file.filename}`;
  await prisma.systemSetting.upsert({ where: { key }, update: { value: url }, create: { key, value: url } });

  await logAudit({ userId: req.user!.id, action: "settings.branding_update", metadata: { key, url } });
  res.status(201).json({ key, url });
});

// Agent API keys
router.get("/agent-keys", requirePermission("admin", "view"), async (_req, res) => {
  res.json(await prisma.agentApiKey.findMany({ orderBy: { createdAt: "desc" } }));
});

router.post("/agent-keys", requirePermission("admin", "create"), async (req, res) => {
  const { generateApiKey } = await import("../../lib/passwords");
  const { registerToken } = await import("../../config/controlPlane");
  const { currentSchemaName } = await import("../../config/prisma");
  const key = generateApiKey();
  const label = (req.body?.label as string) || undefined;
  const record = await prisma.agentApiKey.create({ data: { key, label } });
  // The device agent / network relay authenticate with this raw key and no other tenant claim
  // (see middleware/agentAuth.ts), so the control plane needs to be able to resolve it too.
  await registerToken(key, currentSchemaName(), "agent");
  await logAudit({ userId: req.user!.id, action: "agentKey.create", entityType: "AgentApiKey", entityId: record.id });
  res.status(201).json(record);
});

router.patch("/agent-keys/:id", requirePermission("admin", "edit"), async (req, res) => {
  const record = await prisma.agentApiKey.update({
    where: { id: Number(req.params.id) },
    data: { isActive: Boolean(req.body.isActive) },
  });
  await logAudit({ userId: req.user!.id, action: "agentKey.update", entityType: "AgentApiKey", entityId: record.id });
  res.json(record);
});

export default router;
