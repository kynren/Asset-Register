import { Router } from "express";
import { prisma } from "../../config/prisma";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { verifyJwt } from "../../middleware/auth";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { encryptSecret, decryptSecret } from "../../lib/crypto";
import { createExternalConnectorSchema, updateExternalConnectorSchema } from "./externalConnectors.schema";

// Admin management of outbound "App Connector" credentials — the inverse of ApiConnection
// (apiConnections.routes.ts): instead of another app calling into us, this app calls out to
// another system's API and pulls its data in. See externalConnectorRunner.ts for the actual
// Test/Pull HTTP calls; this file is CRUD plus the two action endpoints that trigger them.
const router = Router();
router.use(verifyJwt);

const listSelect = {
  id: true,
  name: true,
  baseUrl: true,
  authHeaderName: true,
  direction: true,
  resources: true,
  isEnabled: true,
  lastPulledAt: true,
  lastPushedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

router.get("/", requirePermission("app-settings", "view"), async (_req, res) => {
  const connectors = await prisma.externalConnector.findMany({ select: listSelect, orderBy: { createdAt: "desc" } });
  res.json(connectors);
});

// Same "connected app" detail summary shape as ApiConnection's — first real pull vs. createdAt,
// most recent attempt, and a total count — so the frontend's Activity view can reuse the same
// layout pattern already built for API Connections/MCP keys.
router.get("/:id", requirePermission("app-settings", "view"), async (req, res) => {
  const id = Number(req.params.id);
  const connector = await prisma.externalConnector.findUnique({ where: { id }, select: listSelect });
  if (!connector) throw new ApiError(404, "Connector not found");

  const [firstCall, lastCall, callCount] = await Promise.all([
    prisma.externalConnectorLog.findFirst({ where: { connectorId: id }, orderBy: { occurredAt: "asc" } }),
    prisma.externalConnectorLog.findFirst({ where: { connectorId: id }, orderBy: { occurredAt: "desc" } }),
    prisma.externalConnectorLog.count({ where: { connectorId: id } }),
  ]);

  res.json({ ...connector, firstUsedAt: firstCall?.occurredAt ?? null, lastCall, callCount });
});

router.get("/:id/logs", requirePermission("app-settings", "view"), async (req, res) => {
  const id = Number(req.params.id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [items, total] = await Promise.all([
    prisma.externalConnectorLog.findMany({
      where: { connectorId: id },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.externalConnectorLog.count({ where: { connectorId: id } }),
  ]);

  res.json({ items, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// Browse what's actually been landed — otherwise a successful pull is invisible past its log's
// record counts. `store` filters to one resource at a time since a connector can pull several.
router.get("/:id/records", requirePermission("app-settings", "view"), async (req, res) => {
  const id = Number(req.params.id);
  const { page, pageSize, skip, take } = getPagination(req);
  const store = typeof req.query.store === "string" ? req.query.store : undefined;
  const where = { connectorId: id, ...(store ? { store } : {}) };

  const [items, total] = await Promise.all([
    prisma.externalConnectorRecord.findMany({ where, orderBy: { pulledAt: "desc" }, skip, take }),
    prisma.externalConnectorRecord.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
});

router.post("/", requirePermission("app-settings", "create"), validateBody(createExternalConnectorSchema), async (req, res) => {
  const { authHeaderValue, ...rest } = req.body as typeof createExternalConnectorSchema._type;
  const record = await prisma.externalConnector.create({
    data: { ...rest, authHeaderValueEncrypted: encryptSecret(authHeaderValue), createdById: req.user!.id },
    select: listSelect,
  });
  await logAudit({ userId: req.user!.id, action: "externalConnector.create", entityType: "ExternalConnector", entityId: record.id });
  res.status(201).json(record);
});

router.patch("/:id", requirePermission("app-settings", "edit"), validateBody(updateExternalConnectorSchema), async (req, res) => {
  const existing = await prisma.externalConnector.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Connector not found");

  const { authHeaderValue, ...rest } = req.body as typeof updateExternalConnectorSchema._type;
  const data: Record<string, unknown> = { ...rest };
  if (authHeaderValue) data.authHeaderValueEncrypted = encryptSecret(authHeaderValue);

  const record = await prisma.externalConnector.update({ where: { id: existing.id }, data, select: listSelect });
  await logAudit({ userId: req.user!.id, action: "externalConnector.update", entityType: "ExternalConnector", entityId: record.id });
  res.json(record);
});

router.delete("/:id", requirePermission("app-settings", "delete"), async (req, res) => {
  const existing = await prisma.externalConnector.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Connector not found");

  await prisma.externalConnector.delete({ where: { id: existing.id } });
  await logAudit({ userId: req.user!.id, action: "externalConnector.delete", entityType: "ExternalConnector", entityId: existing.id });
  res.status(204).end();
});

// Lightweight reachability check — GET the base URL with the configured auth header and report
// whatever status came back, without landing any records. Mirrors the "Test" button + "✓
// Reachable (HTTP 200)" line on the reference App Connector UI this feature was modeled on.
router.post("/:id/test", requirePermission("app-settings", "edit"), async (req, res) => {
  const connector = await prisma.externalConnector.findUnique({ where: { id: Number(req.params.id) } });
  if (!connector) throw new ApiError(404, "Connector not found");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(connector.baseUrl, {
      headers: { [connector.authHeaderName]: decryptSecret(connector.authHeaderValueEncrypted) },
      signal: controller.signal,
    });
    res.json({ ok: response.ok, statusCode: response.status });
  } catch (err: any) {
    res.json({ ok: false, statusCode: null, error: err?.name === "AbortError" ? "Request timed out." : err?.message ?? "Request failed." });
  } finally {
    clearTimeout(timer);
  }
});

// Extracts a stable id from a pulled record for the upsert key below — tries the field names an
// external API is most likely to use, in order, and falls back to null (meaning "always insert
// fresh, nothing to match against") when none are present.
function extractExternalId(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  const candidate = r.id ?? r.externalId ?? r._id ?? r.uuid;
  return candidate == null ? null : String(candidate);
}

// Manual "Pull now" — GET {baseUrl}?since=<lastPulledAt ISO> with the auth header, expecting
// { stores: { <storeName>: record[] } } per the connector contract. Only stores this connector is
// scoped to (resources[]) are landed; anything else the external API returns is dropped, not
// stored — same "don't keep what you weren't granted" discipline as ApiConnection's resource
// scoping on the inbound side. Records land as raw JSON (ExternalConnectorRecord) rather than
// mapped into Asset/Ticket/etc, since this app has no way to know another system's field shapes
// in advance.
router.post("/:id/pull", requirePermission("app-settings", "edit"), async (req, res) => {
  const connector = await prisma.externalConnector.findUnique({ where: { id: Number(req.params.id) } });
  if (!connector) throw new ApiError(404, "Connector not found");
  if (!connector.isEnabled) throw new ApiError(400, "This connector is disabled.");

  const url = new URL(connector.baseUrl);
  if (connector.lastPulledAt) url.searchParams.set("since", connector.lastPulledAt.toISOString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let logEntry: { ok: boolean; statusCode: number | null; recordCounts: Record<string, number> | null; error: string | null };

  try {
    const response = await fetch(url.toString(), {
      headers: { [connector.authHeaderName]: decryptSecret(connector.authHeaderValueEncrypted) },
      signal: controller.signal,
    });
    if (!response.ok) {
      logEntry = { ok: false, statusCode: response.status, recordCounts: null, error: `HTTP ${response.status}` };
    } else {
      const body: any = await response.json().catch(() => null);
      const stores = body?.stores && typeof body.stores === "object" ? body.stores : {};
      const recordCounts: Record<string, number> = {};

      for (const store of connector.resources) {
        const records = Array.isArray(stores[store]) ? stores[store] : [];
        recordCounts[store] = records.length;
        for (const record of records) {
          const externalId = extractExternalId(record);
          // Only records with a real external id can be matched against a prior pull — landing a
          // record with no id via upsert would let Prisma's null-aware unique lookup collapse
          // every id-less record in this store into a single overwritten row, defeating the
          // "always insert fresh" intent below.
          if (externalId == null) {
            await prisma.externalConnectorRecord.create({ data: { connectorId: connector.id, store, externalId: null, data: record } });
          } else {
            await prisma.externalConnectorRecord.upsert({
              where: { connectorId_store_externalId: { connectorId: connector.id, store, externalId } },
              create: { connectorId: connector.id, store, externalId, data: record },
              update: { data: record, pulledAt: new Date() },
            });
          }
        }
      }
      logEntry = { ok: true, statusCode: response.status, recordCounts, error: null };
      await prisma.externalConnector.update({ where: { id: connector.id }, data: { lastPulledAt: new Date() } });
    }
  } catch (err: any) {
    logEntry = { ok: false, statusCode: null, recordCounts: null, error: err?.name === "AbortError" ? "Request timed out." : err?.message ?? "Request failed." };
  } finally {
    clearTimeout(timer);
  }

  await prisma.externalConnectorLog.create({
    data: { connectorId: connector.id, direction: "PULL", ok: logEntry.ok, statusCode: logEntry.statusCode ?? undefined, recordCounts: logEntry.recordCounts ?? undefined, error: logEntry.error ?? undefined },
  });
  await logAudit({ userId: req.user!.id, action: "externalConnector.pull", entityType: "ExternalConnector", entityId: connector.id, metadata: { ok: logEntry.ok, recordCounts: logEntry.recordCounts } });

  if (!logEntry.ok) return res.status(502).json({ ok: false, error: logEntry.error ?? `HTTP ${logEntry.statusCode}` });
  res.json({ ok: true, recordCounts: logEntry.recordCounts });
});

export default router;
