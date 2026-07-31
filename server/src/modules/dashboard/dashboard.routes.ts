import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { getPagination, paginatedResponse } from "../../lib/pagination";

const router = Router();
router.use(verifyJwt);

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

router.get("/layout", requirePermission("dashboard", "view"), async (req, res) => {
  const layout = await prisma.dashboardLayout.findUnique({ where: { userId: req.user!.id } });
  res.json(layout?.layoutJson ?? null);
});

router.put(
  "/layout",
  requirePermission("dashboard", "view"),
  validateBody(z.object({ layout: z.array(z.record(z.any())) })),
  async (req, res) => {
    await prisma.dashboardLayout.upsert({
      where: { userId: req.user!.id },
      update: { layoutJson: req.body.layout },
      create: { userId: req.user!.id, layoutJson: req.body.layout },
    });
    res.json({ ok: true });
  }
);

export default router;
