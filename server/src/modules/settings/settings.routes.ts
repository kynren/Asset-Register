import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { currentSchemaName, prisma } from "../../config/prisma";
import { registerToken } from "../../config/controlPlane";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { generateApiKey } from "../../lib/passwords";
import { applySystemSettings } from "./settings.service";

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

router.get("/", requirePermission("app-settings", "view"), async (_req, res) => {
  const settings = await prisma.systemSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});

const updateSchema = z.object({ values: z.record(z.string()) });

router.put("/", requirePermission("app-settings", "edit"), validateBody(updateSchema), async (req, res) => {
  const { values } = req.body as { values: Record<string, string> };
  await applySystemSettings(values, req.user!.id);
  res.json({ ok: true });
});

// Branding's scalar fields (company name, brand colors) get their own branding-gated
// read/write, separate from the generic app-settings-gated GET/PUT above — a role holding
// only the "branding" module must not be able to write unrelated app-settings keys (password
// policy, device thresholds, etc.) through the generic endpoint.
const WATERMARK_POSITIONS = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;
const BRAND_FIELD_KEYS = ["companyName", "brandPrimaryColor", "brandSecondaryColor", "docsWatermarkPosition"] as const;
// appIconUrl/faviconUrl/docsWatermarkUrl are read-only here (written only via POST /branding
// below) — included so a "branding"-only role can see current logo/favicon/watermark previews
// without needing app-settings.
const BRAND_READ_KEYS = [...BRAND_FIELD_KEYS, "appIconUrl", "faviconUrl", "docsWatermarkUrl"] as const;
const brandFieldsSchema = z.object({
  companyName: z.string().min(1).optional(),
  brandPrimaryColor: z.string().optional(),
  brandSecondaryColor: z.string().optional(),
  docsWatermarkPosition: z.enum(WATERMARK_POSITIONS).optional(),
});

router.get("/branding-fields", requirePermission("branding", "view"), async (_req, res) => {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: [...BRAND_READ_KEYS] } } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});

router.put("/branding-fields", requirePermission("branding", "edit"), validateBody(brandFieldsSchema), async (req, res) => {
  const values = req.body as Record<string, string | undefined>;
  for (const key of BRAND_FIELD_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    await prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  await logAudit({ userId: req.user!.id, action: "settings.branding_update", metadata: { keys: Object.keys(values) } });
  res.json({ ok: true });
});

const brandingTypeSchema = z.object({ type: z.enum(["appIcon", "favicon", "docsWatermark"]) });
const BRANDING_TYPE_TO_KEY: Record<string, string> = { appIcon: "appIconUrl", favicon: "faviconUrl", docsWatermark: "docsWatermarkUrl" };

router.post("/branding", requirePermission("branding", "edit"), brandingUpload.single("file"), async (req, res) => {
  const parsed = brandingTypeSchema.safeParse(req.body);
  if (!parsed.success || !req.file) throw new ApiError(400, "Missing file or type");

  // The watermark gets embedded as a raster ImageRun in Word exports (docx's ImageRun only
  // accepts jpg/png/gif/bmp, not svg/ico) and its pixel dimensions are read by a hand-rolled
  // PNG/JPEG-only parser (server/src/lib/imageDimensions.ts) for both PDF and Word sizing — so,
  // unlike appIcon/favicon, it can't accept the svg/ico types the generic upload filter allows.
  if (parsed.data.type === "docsWatermark" && !/^image\/(png|jpe?g)$/.test(req.file.mimetype)) {
    fs.unlink(req.file.path, () => {});
    throw new ApiError(400, "Watermark image must be PNG or JPEG");
  }

  const key = BRANDING_TYPE_TO_KEY[parsed.data.type];
  const url = `/uploads/branding/${req.file.filename}`;
  await prisma.systemSetting.upsert({ where: { key }, update: { value: url }, create: { key, value: url } });

  await logAudit({ userId: req.user!.id, action: "settings.branding_update", metadata: { key, url } });
  res.status(201).json({ key, url });
});

router.delete("/branding/docs-watermark", requirePermission("branding", "edit"), async (req, res) => {
  await prisma.systemSetting.deleteMany({ where: { key: "docsWatermarkUrl" } });
  await logAudit({ userId: req.user!.id, action: "settings.branding_update", metadata: { key: "docsWatermarkUrl", removed: true } });
  res.json({ ok: true });
});

// Agent API keys
router.get("/agent-keys", requirePermission("app-settings", "view"), async (_req, res) => {
  res.json(await prisma.agentApiKey.findMany({ orderBy: { createdAt: "desc" } }));
});

router.post("/agent-keys", requirePermission("app-settings", "create"), async (req, res) => {
  const key = generateApiKey();
  const label = (req.body?.label as string) || undefined;
  const record = await prisma.agentApiKey.create({ data: { key, label } });
  // The device agent / network relay authenticate with this raw key and no other tenant claim
  // (see middleware/agentAuth.ts), so the control plane needs to be able to resolve it too.
  await registerToken(key, currentSchemaName(), "agent");
  await logAudit({ userId: req.user!.id, action: "agentKey.create", entityType: "AgentApiKey", entityId: record.id });
  res.status(201).json(record);
});

router.patch("/agent-keys/:id", requirePermission("app-settings", "edit"), async (req, res) => {
  const record = await prisma.agentApiKey.update({
    where: { id: Number(req.params.id) },
    data: { isActive: Boolean(req.body.isActive) },
  });
  await logAudit({ userId: req.user!.id, action: "agentKey.update", entityType: "AgentApiKey", entityId: record.id });
  res.json(record);
});

export default router;
