import { Router } from "express";
import { currentSchemaName, prisma } from "../../config/prisma";
import { registerToken } from "../../config/controlPlane";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { verifyJwt } from "../../middleware/auth";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { generateApiKeyId, generateApiSecret, hashSecret } from "../../lib/apiConnectionCrypto";
import { createApiConnectionSchema, updateApiConnectionSchema } from "./apiConnections.schema";

// Admin management of external REST API credentials (see apiIntegrations.routes.ts for the
// gateway these credentials unlock). Deliberately gated on the "app-settings" module — the same
// permission that already governs everything else on the App Settings / System Settings surface
// this card is rendered on — rather than a bespoke module, since issuing a credential that can
// read/write this organization's data from outside the app is exactly as sensitive as the rest of
// that page's admin-only actions.
const router = Router();
router.use(verifyJwt);

const listSelect = {
  id: true,
  name: true,
  apiKeyId: true,
  resources: true,
  canGet: true,
  canPost: true,
  canPut: true,
  canPatch: true,
  canDelete: true,
  isActive: true,
  allOrganizations: true,
  lastUsedAt: true,
  lastUsedIp: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

router.get("/", requirePermission("app-settings", "view"), async (_req, res) => {
  const connections = await prisma.apiConnection.findMany({ select: listSelect, orderBy: { createdAt: "desc" } });
  res.json(connections);
});

router.post("/", requirePermission("app-settings", "create"), validateBody(createApiConnectionSchema), async (req, res) => {
  // Only a System Admin may mint a connection that can reach every organization, not just this
  // one — a regular org admin has no legitimate reason to set this, so it's silently dropped
  // rather than rejected outright (mirrors how a stray unknown field would be ignored).
  const isSystemAdmin = req.user!.roleName === "System Admin";
  const allOrganizations = isSystemAdmin && req.body.allOrganizations === true;

  const apiKeyId = generateApiKeyId();
  const secret = generateApiSecret();
  const record = await prisma.apiConnection.create({
    data: { ...req.body, allOrganizations, apiKeyId, secretHash: hashSecret(secret), createdById: req.user!.id },
    select: listSelect,
  });
  // schema_name here is always this connection's home organization (the one active when it was
  // created) — that never changes. `allOrganizations` is the only thing that varies the actual
  // per-request routing; see verifyApiConnection for how the two combine.
  await registerToken(apiKeyId, currentSchemaName(), "external-api", allOrganizations);
  await logAudit({ userId: req.user!.id, action: "apiConnection.create", entityType: "ApiConnection", entityId: record.id, metadata: { allOrganizations } });
  // The plaintext secret only ever exists in this one response — it isn't derivable from
  // secretHash afterward, so if it's lost the connection must be revoked and a new one issued.
  res.status(201).json({ ...record, secret, bearerToken: `${apiKeyId}.${secret}` });
});

router.patch("/:id", requirePermission("app-settings", "edit"), validateBody(updateApiConnectionSchema), async (req, res) => {
  const existing = await prisma.apiConnection.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Connection not found");

  const isSystemAdmin = req.user!.roleName === "System Admin";
  const data: Record<string, unknown> = { ...req.body };
  if (req.body.allOrganizations !== undefined) {
    if (!isSystemAdmin) throw new ApiError(403, "Only a System Admin can change this connection's organization scope.");
    data.allOrganizations = req.body.allOrganizations === true;
  }
  if (req.body.isActive === false && existing.isActive) data.revokedAt = new Date();
  if (req.body.isActive === true && !existing.isActive) data.revokedAt = null;

  const record = await prisma.apiConnection.update({ where: { id: existing.id }, data, select: listSelect });
  // The home organization (schema_name) never changes on edit — only the all-organizations flag
  // can, so this re-registers with the same schema and the (possibly new) flag value.
  if (req.body.allOrganizations !== undefined) {
    await registerToken(record.apiKeyId, currentSchemaName(), "external-api", record.allOrganizations);
  }
  await logAudit({ userId: req.user!.id, action: "apiConnection.update", entityType: "ApiConnection", entityId: record.id });
  res.json(record);
});

router.delete("/:id", requirePermission("app-settings", "delete"), async (req, res) => {
  const existing = await prisma.apiConnection.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Connection not found");

  await prisma.apiConnection.delete({ where: { id: existing.id } });
  await logAudit({ userId: req.user!.id, action: "apiConnection.delete", entityType: "ApiConnection", entityId: existing.id });
  res.status(204).end();
});

export default router;
