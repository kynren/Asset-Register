import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { hasPermission } from "../../middleware/rbac";
import { toCsv } from "../../lib/csv";
import { sendEmail } from "../../lib/email";
import { runQuery, SOURCES, QuerySpec, QueryResult, FilterSpec, SourceDef } from "../dashboard/dataExplorer";
import { RECORD_ACCESS_BYPASS_ROLE_NAMES } from "../../lib/recordAccess";

async function myTeamIds(userId: number): Promise<number[]> {
  const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  return memberships.map((m) => m.teamId);
}

async function loadReportWithAccess(id: number, userId: number) {
  const report = await prisma.report.findUnique({ where: { id }, include: { shares: true } });
  if (!report) throw new ApiError(404, "Report not found");

  if (report.ownerId === userId) return { report, isOwner: true, canEdit: true };

  const teamIds = await myTeamIds(userId);
  const share = report.shares.find((s) => s.sharedWithUserId === userId || (s.sharedWithTeamId && teamIds.includes(s.sharedWithTeamId)));
  if (!share) throw new ApiError(403, "You don't have access to this report");
  return { report, isOwner: false, canEdit: share.canEdit };
}

function shapeReport(
  r: { id: number; name: string; description: string | null; source: string; visualization: string; isDefault: boolean; ownerId: number; updatedAt: Date },
  isOwner: boolean,
  canEdit: boolean,
  ownerName?: string
) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    source: r.source,
    visualization: r.visualization,
    isDefault: r.isDefault,
    isOwner,
    canEdit,
    ownerName,
    updatedAt: r.updatedAt,
  };
}

function reportSpec(report: { source: string; filters: unknown; columns: unknown; groupBy: string | null; visualization: string }, limit: number): QuerySpec {
  return {
    source: report.source,
    filters: (report.filters as FilterSpec | null) ?? undefined,
    columns: (report.columns as string[] | null) ?? undefined,
    groupBy: report.groupBy ?? undefined,
    visualization: report.visualization as QuerySpec["visualization"],
    limit,
  };
}

async function assertSourceViewable(sourceId: string, user: { roleId: number; roleName: string }) {
  const source = SOURCES[sourceId];
  if (!source) throw new ApiError(400, `Unknown data source: ${sourceId}`);
  if (user.roleName === "System Admin") return source;
  if (!(await hasPermission(user.roleId, source.module, "view"))) {
    throw new ApiError(403, `Not permitted to view ${source.module}`);
  }
  return source;
}

// Every visualization kind normalized down to a flat {columns, rows} table shape — chart results
// become a 2-column label/count table, a KPI becomes a single-cell table — so export/print/email
// always have something tabular to work with regardless of how the report is configured.
function normalizeForExport(result: QueryResult): { columns: string[]; rows: Record<string, unknown>[] } {
  if (result.kind === "table") return { columns: result.columns, rows: result.rows };
  if (result.kind === "chart") return { columns: ["label", "count"], rows: result.data };
  return { columns: ["value"], rows: [{ value: result.value }] };
}

function humanizeColumn(key: string, source: SourceDef | undefined) {
  const known = source?.availableColumns.find((c) => c.value === key)?.label;
  if (known) return known;
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (Array.isArray(value)) return value.map(formatCellValue).join(", ");
  return String(value);
}

function renderReportPdf(
  doc: PDFKit.PDFDocument,
  report: { name: string; description: string | null },
  columns: string[],
  rows: Record<string, unknown>[],
  source: SourceDef | undefined
) {
  doc.fontSize(18).fillColor("#101828").text(report.name);
  if (report.description) doc.fontSize(10).fillColor("#475467").text(report.description);
  doc.fontSize(9).fillColor("#667085").text(`Generated ${new Date().toLocaleString()} — ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  doc.moveDown(1);

  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = usableWidth / Math.max(columns.length, 1);
  let y = doc.y;

  function ensureSpace(rowHeight: number) {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  }

  ensureSpace(16);
  doc.fontSize(9).fillColor("#101828");
  columns.forEach((c, i) => {
    doc.text(humanizeColumn(c, source), startX + i * colWidth, y, { width: colWidth - 6, height: 12, ellipsis: true, lineBreak: false });
  });
  y += 16;
  doc.moveTo(startX, y).lineTo(startX + usableWidth, y).strokeColor("#e5e7eb").stroke();
  y += 4;

  doc.fontSize(8).fillColor("#344054");
  for (const row of rows) {
    ensureSpace(14);
    columns.forEach((c, i) => {
      doc.text(formatCellValue(row[c]), startX + i * colWidth, y, { width: colWidth - 6, height: 12, ellipsis: true, lineBreak: false });
    });
    y += 14;
  }
}

// Every report the caller can see: ones they own, plus ones shared with them directly or via a
// team they belong to — mirrors dashboards.controller.ts/savedViews.controller.ts exactly.
export async function listReports(req: Request, res: Response) {
  const userId = req.user!.id;
  const teamIds = await myTeamIds(userId);

  const [owned, sharedDirect, sharedViaTeam] = await Promise.all([
    prisma.report.findMany({ where: { ownerId: userId }, orderBy: { updatedAt: "desc" } }),
    prisma.report.findMany({
      where: { shares: { some: { sharedWithUserId: userId } } },
      include: { owner: { select: { firstName: true, lastName: true } }, shares: { where: { sharedWithUserId: userId } } },
    }),
    teamIds.length
      ? prisma.report.findMany({
          where: { shares: { some: { sharedWithTeamId: { in: teamIds } } } },
          include: { owner: { select: { firstName: true, lastName: true } }, shares: { where: { sharedWithTeamId: { in: teamIds } } } },
        })
      : Promise.resolve([]),
  ]);

  const sharedMap = new Map<number, { report: (typeof sharedDirect)[number]; canEdit: boolean }>();
  for (const r of [...sharedDirect, ...sharedViaTeam]) {
    const canEdit = r.shares.some((s) => s.canEdit);
    const existing = sharedMap.get(r.id);
    sharedMap.set(r.id, { report: r, canEdit: existing ? existing.canEdit || canEdit : canEdit });
  }

  const result = [
    ...owned.map((r) => shapeReport(r, true, true)),
    ...[...sharedMap.values()].map(({ report: r, canEdit }) => shapeReport(r, false, canEdit, `${r.owner.firstName} ${r.owner.lastName}`)),
  ];
  res.json(result);
}

export async function listSharedWithMe(req: Request, res: Response) {
  const userId = req.user!.id;
  const teamIds = await myTeamIds(userId);

  const shared = await prisma.report.findMany({
    where: {
      ownerId: { not: userId },
      shares: { some: { OR: [{ sharedWithUserId: userId }, ...(teamIds.length ? [{ sharedWithTeamId: { in: teamIds } }] : [])] } },
    },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      shares: { where: { OR: [{ sharedWithUserId: userId }, ...(teamIds.length ? [{ sharedWithTeamId: { in: teamIds } }] : [])] } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.json(shared.map((r) => shapeReport(r, false, r.shares.some((s) => s.canEdit), `${r.owner.firstName} ${r.owner.lastName}`)));
}

export async function createReport(req: Request, res: Response) {
  await assertSourceViewable(req.body.source, req.user!);
  const report = await prisma.report.create({
    data: {
      name: req.body.name,
      description: req.body.description ?? null,
      source: req.body.source,
      filters: req.body.filters ?? undefined,
      columns: req.body.columns ?? undefined,
      groupBy: req.body.groupBy ?? null,
      visualization: req.body.visualization ?? "table",
      sortBy: req.body.sortBy ?? null,
      sortDir: req.body.sortDir ?? "asc",
      ownerId: req.user!.id,
    },
  });
  res.status(201).json(shapeReport(report, true, true));
}

export async function updateReport(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { report, canEdit } = await loadReportWithAccess(id, req.user!.id);
  if (!canEdit) throw new ApiError(403, "You don't have edit access to this report");
  if (req.body.source) await assertSourceViewable(req.body.source, req.user!);

  const { isDefault, ...rest } = req.body as Record<string, unknown>;
  const updated = await prisma.report.update({
    where: { id },
    data: {
      ...(rest.name !== undefined ? { name: rest.name as string } : {}),
      ...(rest.description !== undefined ? { description: rest.description as string | null } : {}),
      ...(rest.source !== undefined ? { source: rest.source as string } : {}),
      ...(rest.filters !== undefined ? { filters: rest.filters as any } : {}),
      ...(rest.columns !== undefined ? { columns: rest.columns as any } : {}),
      ...(rest.groupBy !== undefined ? { groupBy: rest.groupBy as string | null } : {}),
      ...(rest.visualization !== undefined ? { visualization: rest.visualization as string } : {}),
      ...(rest.sortBy !== undefined ? { sortBy: rest.sortBy as string | null } : {}),
      ...(rest.sortDir !== undefined ? { sortDir: rest.sortDir as string } : {}),
      ...(isDefault ? { isDefault: true } : {}),
    },
  });
  if (isDefault) {
    await prisma.report.updateMany({ where: { ownerId: report.ownerId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
  }
  res.json(shapeReport(updated, report.ownerId === req.user!.id, true));
}

export async function deleteReport(req: Request, res: Response) {
  const id = Number(req.params.id);
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) throw new ApiError(404, "Report not found");

  const isOwner = report.ownerId === req.user!.id;
  const isAdmin = RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName);
  if (!isOwner && !isAdmin) throw new ApiError(403, "Only the owner or a System/Super Admin can delete this report");

  await prisma.report.delete({ where: { id } });
  res.json({ ok: true });
}

// Any viewer (owner or shared-with) can duplicate a report into their own private, fully-editable
// copy — the original and its shares are untouched.
export async function duplicateReport(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { report } = await loadReportWithAccess(id, req.user!.id);

  const copy = await prisma.report.create({
    data: {
      name: `${report.name} (Copy)`,
      description: report.description,
      source: report.source,
      filters: report.filters as any,
      columns: report.columns as any,
      groupBy: report.groupBy,
      visualization: report.visualization,
      sortBy: report.sortBy,
      sortDir: report.sortDir,
      ownerId: req.user!.id,
      isDefault: false,
    },
  });
  res.status(201).json(shapeReport(copy, true, true));
}

export async function getReport(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { report, isOwner, canEdit } = await loadReportWithAccess(id, req.user!.id);
  res.json({
    id: report.id,
    name: report.name,
    description: report.description,
    source: report.source,
    filters: report.filters,
    columns: report.columns,
    groupBy: report.groupBy,
    visualization: report.visualization,
    sortBy: report.sortBy,
    sortDir: report.sortDir,
    isOwner,
    canEdit,
  });
}

export async function listShares(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { isOwner } = await loadReportWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can view shares");

  const shares = await prisma.reportShare.findMany({
    where: { reportId: id },
    include: { sharedWithUser: { select: { firstName: true, lastName: true, email: true } }, sharedWithTeam: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    shares.map((s) => ({
      id: s.id,
      canEdit: s.canEdit,
      userName: s.sharedWithUser ? `${s.sharedWithUser.firstName} ${s.sharedWithUser.lastName}` : null,
      userEmail: s.sharedWithUser?.email ?? null,
      teamName: s.sharedWithTeam?.name ?? null,
    }))
  );
}

export async function createShare(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { isOwner } = await loadReportWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can share this report");

  const { userId, teamId, canEdit } = req.body as { userId?: number; teamId?: number; canEdit: boolean };
  const share = await prisma.reportShare.upsert({
    where: userId
      ? { reportId_sharedWithUserId: { reportId: id, sharedWithUserId: userId } }
      : { reportId_sharedWithTeamId: { reportId: id, sharedWithTeamId: teamId! } },
    update: { canEdit },
    create: { reportId: id, sharedWithUserId: userId, sharedWithTeamId: teamId, canEdit },
  });
  res.status(201).json({ id: share.id, canEdit: share.canEdit });
}

export async function deleteShare(req: Request, res: Response) {
  const id = Number(req.params.id);
  const shareId = Number(req.params.shareId);
  const { isOwner } = await loadReportWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can remove a share");

  await prisma.reportShare.delete({ where: { id: shareId } });
  res.json({ ok: true });
}

// Live preview while building a report, before it's saved — same shape/limit as a saved report's
// run, just against an in-flight spec rather than a stored row.
export async function previewSpec(req: Request, res: Response) {
  const body = req.body as { source: string; filters?: FilterSpec | null; columns?: string[] | null; groupBy?: string | null; visualization: QuerySpec["visualization"] };
  const source = await assertSourceViewable(body.source, req.user!);
  const spec: QuerySpec = {
    source: source.id,
    filters: body.filters ?? undefined,
    columns: body.columns ?? undefined,
    groupBy: body.groupBy ?? undefined,
    visualization: body.visualization,
    limit: 100,
  };
  const result = await runQuery(spec, req.user);
  res.json(result);
}

export async function runReport(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { report } = await loadReportWithAccess(id, req.user!.id);
  await assertSourceViewable(report.source, req.user!);
  const result = await runQuery(reportSpec(report, 500), req.user);
  res.json(result);
}

export async function exportCsv(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { report } = await loadReportWithAccess(id, req.user!.id);
  await assertSourceViewable(report.source, req.user!);
  const result = await runQuery(reportSpec(report, 2000), req.user);
  const { columns, rows } = normalizeForExport(result);

  const csv = toCsv(rows, columns);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${report.name.replace(/[^a-z0-9-_]+/gi, "_")}.csv"`);
  res.send(csv);
}

async function buildPdfBuffer(report: { name: string; description: string | null; source: string }, columns: string[], rows: Record<string, unknown>[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: columns.length > 5 ? "landscape" : "portrait" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderReportPdf(doc, report, columns, rows, SOURCES[report.source]);
    doc.end();
  });
}

async function exportPdfImpl(req: Request, res: Response, disposition: "attachment" | "inline") {
  const id = Number(req.params.id);
  const { report } = await loadReportWithAccess(id, req.user!.id);
  await assertSourceViewable(report.source, req.user!);
  const result = await runQuery(reportSpec(report, 2000), req.user);
  const { columns, rows } = normalizeForExport(result);
  const buffer = await buildPdfBuffer(report, columns, rows);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${report.name.replace(/[^a-z0-9-_]+/gi, "_")}.pdf"`);
  res.send(buffer);
}

export async function exportPdf(req: Request, res: Response) {
  await exportPdfImpl(req, res, "attachment");
}

export async function previewPdf(req: Request, res: Response) {
  await exportPdfImpl(req, res, "inline");
}

export async function emailReport(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { report } = await loadReportWithAccess(id, req.user!.id);
  await assertSourceViewable(report.source, req.user!);
  const { to, format, message } = req.body as { to: string[]; format: "pdf" | "csv"; message?: string };

  const result = await runQuery(reportSpec(report, 2000), req.user);
  const { columns, rows } = normalizeForExport(result);

  const safeName = report.name.replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `${safeName}.${format}`;
  const tmpPath = path.join(os.tmpdir(), `report-${report.id}-${Date.now()}.${format}`);
  const content = format === "pdf" ? await buildPdfBuffer(report, columns, rows) : Buffer.from(toCsv(rows, columns), "utf-8");
  await fs.writeFile(tmpPath, content);

  try {
    const results = await Promise.all(
      to.map((recipient) =>
        sendEmail({
          to: recipient,
          subject: report.name,
          text: message?.trim() ? message : `Attached is the "${report.name}" report, generated ${new Date().toLocaleString()}.`,
          attachments: [{ filename, path: tmpPath }],
        })
      )
    );
    res.json({ ok: true, delivered: results.every((r) => r.delivered) });
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}
