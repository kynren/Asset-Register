import { NextFunction, Request, Response, Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { hasPermission, requirePermission } from "../../middleware/rbac";
import { ModuleName } from "../../constants/modules";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { runQuery, SOURCES } from "./dataExplorer";
import * as dashboards from "./dashboards.controller";
import { createDashboardSchema, layoutSchema, renameDashboardSchema, shareDashboardSchema } from "./dashboards.schema";

const router = Router();
router.use(verifyJwt);

// Per-page dashboards (module dashboards on Assets/Helpdesk/Stock/Network/Docs) are gated by that
// page's own module permission — a user who can view Assets should see the Assets dashboard tab
// regardless of whether they hold the separate "dashboard" (home) permission. "home" is the one
// module that still maps to the "dashboard" permission, matching the original single-dashboard
// behavior before per-module layouts existed.
const MODULE_PERMISSION: Record<string, ModuleName> = {
  home: "dashboard",
  assets: "assets",
  helpdesk: "helpdesk",
  stock: "stock",
  network: "network",
  docs: "docs",
  reports: "reports",
};

function requireModuleDashboardPermission(action: "view" | "edit") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const moduleParam = req.params.module;
    const permModule = MODULE_PERMISSION[moduleParam];
    if (!permModule) throw new ApiError(400, `Unknown dashboard module: ${moduleParam}`);
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.roleName === "System Admin") return next();
    if (!(await hasPermission(req.user.roleId, permModule, action))) {
      return res.status(403).json({ error: `Not permitted to ${action} ${permModule}` });
    }
    next();
  };
}

// Same check as above but reads the module from a query param / body field instead of a route
// param — used by the dashboard-list/create/default endpoints below, which aren't nested under
// /:module the way the old single-layout-per-module routes were.
function requireModuleDashboardPermissionFrom(source: "query" | "body", action: "view" | "edit") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const moduleParam = String((source === "query" ? req.query.module : req.body.module) ?? "home");
    const permModule = MODULE_PERMISSION[moduleParam];
    if (!permModule) throw new ApiError(400, `Unknown dashboard module: ${moduleParam}`);
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.roleName === "System Admin") return next();
    if (!(await hasPermission(req.user.roleId, permModule, action))) {
      return res.status(403).json({ error: `Not permitted to ${action} ${permModule}` });
    }
    next();
  };
}

async function computeSummary() {
  const [assetsByStatus, ticketsByStatus, stockItems, devices, documentsTotal, docsReviewOverdue] = await Promise.all([
    prisma.asset.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.stockItem.findMany(),
    prisma.device.findMany({ select: { lastSeen: true } }),
    prisma.document.count(),
    prisma.document.count({ where: { reviewDueDate: { lt: new Date() } } }),
  ]);

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const devicesSeen24h = devices.filter((d) => d.lastSeen.getTime() >= cutoff).length;
  const lowStockCount = stockItems.filter((i) => i.quantityOnHand <= i.reorderLevel).length;

  const totalAssets = assetsByStatus.reduce((sum, g) => sum + g._count._all, 0);
  const openTickets = ticketsByStatus
    .filter((g) => g.status === "OPEN" || g.status === "IN_PROGRESS")
    .reduce((sum, g) => sum + g._count._all, 0);
  const closedTickets = ticketsByStatus
    .filter((g) => g.status === "RESOLVED" || g.status === "CLOSED")
    .reduce((sum, g) => sum + g._count._all, 0);

  return {
    kpis: { totalAssets, openTickets, closedTickets, lowStockCount, devicesTotal: devices.length, devicesSeen24h, documentsTotal, docsReviewOverdue },
    assetsByStatus: assetsByStatus.map((g) => ({ status: g.status, count: g._count._all })),
    ticketsByStatus: ticketsByStatus.map((g) => ({ status: g.status, count: g._count._all })),
  };
}

router.get("/summary", requirePermission("dashboard", "view"), async (_req, res) => {
  res.json(await computeSummary());
});

router.get("/briefing", requirePermission("dashboard", "view"), async (req, res) => {
  const [summary, companySetting, recentActivity, maintenanceDue] = await Promise.all([
    computeSummary(),
    prisma.systemSetting.findUnique({ where: { key: "companyName" } }),
    prisma.auditLog.findMany({ take: 10, orderBy: { createdAt: "desc" }, include: { user: { select: { firstName: true, lastName: true } } } }),
    prisma.asset.findMany({ where: { nextServiceDate: { lte: new Date() } }, select: { assetTag: true, name: true, nextServiceDate: true } }),
  ]);

  const companyName = companySetting?.value ?? "Kynren";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=operations-briefing.pdf");

  const doc = new PDFDocument({ margin: 44 });
  doc.pipe(res);

  doc.fontSize(20).text(`${companyName} — Operations Briefing`, { align: "left" });
  doc.fontSize(10).fillColor("#667085").text(new Date().toLocaleString());
  doc.moveDown(1);

  doc.fillColor("#000").fontSize(13).text("Key Metrics");
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Total assets: ${summary.kpis.totalAssets}`);
  doc.text(`Open tickets: ${summary.kpis.openTickets}   Closed tickets: ${summary.kpis.closedTickets}`);
  doc.text(`Low stock items: ${summary.kpis.lowStockCount}`);
  doc.text(`Devices seen (24h): ${summary.kpis.devicesSeen24h} / ${summary.kpis.devicesTotal}`);
  doc.text(`Docs & SOPs: ${summary.kpis.documentsTotal}${summary.kpis.docsReviewOverdue ? ` (${summary.kpis.docsReviewOverdue} overdue for review)` : ""}`);
  doc.moveDown(1);

  doc.fontSize(13).text("Maintenance Due");
  doc.moveDown(0.3);
  doc.fontSize(10);
  if (maintenanceDue.length === 0) {
    doc.text("No assets are currently due for maintenance.");
  } else {
    maintenanceDue.forEach((a) => doc.text(`${a.assetTag} — ${a.name} (due ${a.nextServiceDate?.toDateString()})`));
  }
  doc.moveDown(1);

  doc.fontSize(13).text("Recent Activity");
  doc.moveDown(0.3);
  doc.fontSize(10);
  recentActivity.forEach((a) => {
    const who = a.user ? `${a.user.firstName} ${a.user.lastName}` : "System";
    doc.text(`${a.createdAt.toLocaleString()} — ${who} — ${a.action}`);
  });

  doc.end();
});

router.get("/activity", requirePermission("dashboard", "view"), async (req, res) => {
  const { page, pageSize, skip, take } = getPagination(req);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  res.json(
    paginatedResponse(
      items.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        createdAt: a.createdAt,
        user: a.user ? `${a.user.firstName} ${a.user.lastName}` : "System",
      })),
      total,
      page,
      pageSize
    )
  );
});

// Named, shareable dashboards — a module can have any number of them, each owned by one user and
// optionally shared (view or edit) with other users or teams. Replaces the old one-row-per-
// (user,module) DashboardLayout.
router.get("/dashboards", requireModuleDashboardPermissionFrom("query", "view"), dashboards.listDashboards);
router.get("/dashboards/default", requireModuleDashboardPermissionFrom("query", "view"), dashboards.getOrCreateDefault);
router.get("/dashboards/shared-with-me", requireModuleDashboardPermissionFrom("query", "view"), dashboards.listSharedWithMe);
router.post("/dashboards", requireModuleDashboardPermissionFrom("body", "view"), validateBody(createDashboardSchema), dashboards.createDashboard);
router.patch("/dashboards/:id", validateBody(renameDashboardSchema), dashboards.renameDashboard);
router.delete("/dashboards/:id", dashboards.deleteDashboard);
router.post("/dashboards/:id/duplicate", dashboards.duplicateDashboard);
router.get("/dashboards/:id/layout", dashboards.getLayout);
router.put("/dashboards/:id/layout", validateBody(layoutSchema), dashboards.putLayout);
router.get("/dashboards/:id/shares", dashboards.listShares);
router.post("/dashboards/:id/shares", validateBody(shareDashboardSchema), dashboards.createShare);
router.delete("/dashboards/:id/shares/:shareId", dashboards.deleteShare);

// Backs the home dashboard's "Custom Query Widget" — a full ad-hoc query builder (source + AND/OR
// filter conditions + groupBy + visualization) that can pull from any of the sources in
// dataExplorer.ts's registry, gated per-source by that source's own module "view" permission (e.g.
// picking the Users source requires the "admin" permission) rather than a blanket dashboard
// permission, so a widget never surfaces data the requesting user couldn't already see elsewhere.
const dataExplorerConditionSchema = z.object({ field: z.string(), operator: z.string(), value: z.any() });
const dataExplorerQuerySchema = z.object({
  source: z.string(),
  filters: z
    .object({
      combinator: z.enum(["AND", "OR"]).default("AND"),
      conditions: z.array(dataExplorerConditionSchema).default([]),
    })
    .optional(),
  groupBy: z.string().optional(),
  visualization: z.enum(["kpi", "table", "bar", "pie", "line"]),
  columns: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
});

router.post("/query", validateBody(dataExplorerQuerySchema), async (req, res) => {
  const source = SOURCES[req.body.source];
  if (!source) throw new ApiError(400, `Unknown data source: ${req.body.source}`);
  if (req.user!.roleName !== "System Admin" && !(await hasPermission(req.user!.roleId, source.module, "view"))) {
    return res.status(403).json({ error: `Not permitted to view ${source.module}` });
  }
  const result = await runQuery(req.body, { id: req.user!.id, roleId: req.user!.roleId, roleName: req.user!.roleName });
  res.json(result);
});

// Field/operator metadata only (no actual records) — safe to return unfiltered; the client narrows
// which sources it *offers* using the caller's own permission set via usePermission, and the /query
// endpoint above re-checks permission server-side regardless of what the client shows.
router.get("/query/sources", (_req, res) => {
  res.json(Object.values(SOURCES));
});

export default router;
