import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getSchemaRegistry } from "./schemaRegistry";
import * as service from "./databaseManager.service";

const router = Router();
router.use(verifyJwt);

function noStore(res: import("express").Response) {
  res.setHeader("Cache-Control", "no-store");
}

function parseId(req: import("express").Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new ApiError(400, "Invalid id");
  return id;
}

router.get("/schema", requirePermission("app-settings", "view"), (_req, res) => {
  noStore(res);
  res.json(getSchemaRegistry());
});

router.get("/stats", requirePermission("app-settings", "view"), async (_req, res) => {
  noStore(res);
  res.json(await service.getStats());
});

router.get("/tables/:model/options", requirePermission("app-settings", "view"), async (req, res) => {
  noStore(res);
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  res.json(await service.listOptions(req.params.model, search));
});

router.get("/tables/:model", requirePermission("app-settings", "view"), async (req, res) => {
  noStore(res);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
  const sortField = typeof req.query.sortField === "string" ? req.query.sortField : undefined;
  const sortDir = req.query.sortDir === "asc" ? "asc" : "desc";
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  res.json(await service.listRows(req.params.model, { page, pageSize, sortField, sortDir, search }));
});

router.get("/tables/:model/:id", requirePermission("app-settings", "view"), async (req, res) => {
  noStore(res);
  res.json(await service.getRow(req.params.model, parseId(req)));
});

router.post("/tables/:model", requirePermission("app-settings", "create"), async (req, res) => {
  const row = await service.createRow(req.params.model, req.body ?? {});
  await logAudit({ userId: req.user!.id, action: "databaseManager.create", entityType: req.params.model, entityId: (row as any).id, metadata: { model: req.params.model } });
  res.status(201).json(row);
});

router.patch("/tables/:model/:id", requirePermission("app-settings", "edit"), async (req, res) => {
  const id = parseId(req);
  const row = await service.updateRow(req.params.model, id, req.body ?? {});
  await logAudit({ userId: req.user!.id, action: "databaseManager.update", entityType: req.params.model, entityId: id, metadata: { model: req.params.model } });
  res.json(row);
});

router.delete("/tables/:model/:id", requirePermission("app-settings", "delete"), async (req, res) => {
  const id = parseId(req);
  await service.deleteRow(req.params.model, id);
  await logAudit({ userId: req.user!.id, action: "databaseManager.delete", entityType: req.params.model, entityId: id, metadata: { model: req.params.model } });
  res.json({ ok: true });
});

export default router;
