import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";
import { toCsv } from "../../lib/csv";
import { bulkStatusSchema } from "../assets/assets.schema";
import projectsRoutes from "./projects.routes";
import rssRoutes from "./rss.routes";
import knowledgeRoutes from "./knowledge.routes";
import bookingsRoutes from "./bookings.routes";
import savedQueriesRoutes from "./savedQueries.routes";
import schedulingRoutes from "./scheduling.routes";

const router = Router();
router.use(verifyJwt);

router.use("/projects", projectsRoutes);
router.use("/rss", rssRoutes);
router.use("/knowledge", knowledgeRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/saved-queries", savedQueriesRoutes);
router.use("/scheduling", schedulingRoutes);

router.post("/bulk-status", requirePermission("operations", "edit"), validateBody(bulkStatusSchema), async (req, res) => {
  const { assetIds, status } = req.body;
  const result = await prisma.asset.updateMany({ where: { id: { in: assetIds } }, data: { status } });
  await logAudit({ userId: req.user!.id, action: "operations.bulk_status", metadata: { assetIds, status } });
  res.json({ updated: result.count });
});

router.get("/maintenance-due", requirePermission("operations", "view"), async (_req, res) => {
  const assets = await prisma.asset.findMany({
    where: { nextServiceDate: { lte: new Date() } },
    include: { category: true, location: true, assignedTo: { select: { firstName: true, lastName: true } } },
    orderBy: { nextServiceDate: "asc" },
  });
  res.json(assets);
});

router.get("/reports/:type", requirePermission("operations", "export"), async (req, res) => {
  const { type } = req.params;
  const format = (req.query.format as string) || "csv";

  let rows: Record<string, unknown>[] = [];
  let columns: string[] = [];
  let title = "";

  if (type === "assets") {
    const assets = await prisma.asset.findMany({ include: { category: true, location: true, assignedTo: true } });
    title = "Asset Register Report";
    columns = ["assetTag", "name", "status", "category", "location", "assignedTo"];
    rows = assets.map((a) => ({
      assetTag: a.assetTag,
      name: a.name,
      status: a.status,
      category: a.category?.name ?? "",
      location: a.location?.name ?? "",
      assignedTo: a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : "",
    }));
  } else if (type === "stock") {
    const items = await prisma.stockItem.findMany();
    title = "Stock Register Report";
    columns = ["sku", "name", "quantityOnHand", "reorderLevel", "unit"];
    rows = items.map((i) => ({ sku: i.sku, name: i.name, quantityOnHand: i.quantityOnHand, reorderLevel: i.reorderLevel, unit: i.unit }));
  } else if (type === "tickets") {
    const tickets = await prisma.ticket.findMany({ include: { requester: true, assignee: true } });
    title = "Helpdesk Ticket Report";
    columns = ["ticketNumber", "title", "status", "priority", "requester", "assignee"];
    rows = tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      requester: `${t.requester.firstName} ${t.requester.lastName}`,
      assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "",
    }));
  } else {
    return res.status(400).json({ error: "Unknown report type" });
  }

  await logAudit({ userId: req.user!.id, action: "operations.report", metadata: { type, format } });

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${type}-report.pdf`);
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown();
    doc.fontSize(10);
    rows.forEach((row) => {
      doc.text(columns.map((c) => `${c}: ${row[c] ?? ""}`).join("  |  "));
      doc.moveDown(0.3);
    });
    doc.end();
  } else {
    const csv = toCsv(rows, columns);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${type}-report.csv`);
    res.send(csv);
  }
});

export default router;
