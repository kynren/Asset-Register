import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { syncDocumentToGit } from "../../lib/docsGitSync";
import { RECORD_ACCESS_BYPASS_ROLE_NAMES, grantRecordAccess, hasRecordAccess, listRecordAccess, listRecordAccessBatch, revokeRecordAccess } from "../../lib/recordAccess";
import { buildDocDocxBuffer, buildDocPdfBuffer, WatermarkAsset, WatermarkPosition } from "../../lib/docExport";
import { readImageDimensions } from "../../lib/imageDimensions";
import { convertUploadToHtml, convertDocxToSections } from "../../lib/docImport";
import { buildDocTemplateBuffer } from "../../lib/docTemplate";
import { DocTypeValue, SECTIONS_SCHEMA_BY_TYPE, docTypeSchema } from "./docs.schema";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "docs");
const ENTITY_TYPE = "Document";

const listSelect = {
  id: true,
  title: true,
  docType: true,
  category: true,
  collectionId: true,
  collection: { select: { id: true, name: true } },
  summary: true,
  tags: true,
  isPublished: true,
  reviewDueDate: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

const detailInclude = {
  collection: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  attachments: { orderBy: { createdAt: "asc" as const } },
};

// Flattens the docType-specific `sections` JSON (whatever shape it has) down to plain text, so
// full-text search can run against one simple column regardless of how deeply nested a given
// type's sections are — a Maintenance Checklist's array of {item, criteria} objects and an SOP's
// array of {step} strings both just become space-separated words here. Rich-text (WYSIWYG)
// section values are stored as HTML, so string leaves are stripped of tags before joining —
// otherwise stray markup would dilute search ranking and leak into result snippets.
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function flattenToText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [stripHtml(value)];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenToText);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenToText);
  return [];
}

function buildSearchText(input: { title: string; summary?: string | null; sections: Record<string, unknown>; tags: string[] }): string {
  return [input.title, input.summary ?? "", flattenToText(input.sections).join(" "), input.tags.join(" ")].join(" ");
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const { docType, category, collectionId, tag, search } = req.query as Record<string, string | undefined>;

  if (search && search.trim()) {
    const conditions: Prisma.Sql[] = [Prisma.sql`to_tsvector('english', "searchText") @@ websearch_to_tsquery('english', ${search})`];
    if (docType) conditions.push(Prisma.sql`"docType" = ${docType}::"DocType"`);
    if (category) conditions.push(Prisma.sql`"category" = ${category}`);
    if (collectionId) conditions.push(Prisma.sql`"collectionId" = ${Number(collectionId)}`);
    if (tag) conditions.push(Prisma.sql`${tag} = ANY("tags")`);
    const whereSql = Prisma.join(conditions, " AND ");

    const rows = await prisma.$queryRaw<
      { id: number; title: string; docType: DocTypeValue; category: string; collectionId: number; summary: string | null; tags: string[]; isPublished: boolean; reviewDueDate: Date | null; createdAt: Date; updatedAt: Date; createdById: number }[]
    >(Prisma.sql`
      SELECT id, title, "docType", category, "collectionId", summary, tags, "isPublished", "reviewDueDate", "createdAt", "updatedAt", "createdById"
      FROM "Document"
      WHERE ${whereSql}
      ORDER BY ts_rank_cd(to_tsvector('english', "searchText"), websearch_to_tsquery('english', ${search})) DESC
      LIMIT ${take} OFFSET ${skip}
    `);
    const countRows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint as count FROM "Document" WHERE ${whereSql}`);
    const total = Number(countRows[0]?.count ?? 0);

    const creatorIds = [...new Set(rows.map((r) => r.createdById))];
    const collectionIds = [...new Set(rows.map((r) => r.collectionId))];
    const [creators, collections] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, firstName: true, lastName: true } }),
      prisma.docCollection.findMany({ where: { id: { in: collectionIds } }, select: { id: true, name: true } }),
    ]);
    const creatorMap = new Map(creators.map((c) => [c.id, c]));
    const collectionMap = new Map(collections.map((c) => [c.id, c]));
    const accessByDoc = await listRecordAccessBatch(ENTITY_TYPE, rows.map((r) => r.id));
    const items = rows.map(({ createdById, ...r }) => ({
      ...r,
      createdById,
      createdBy: creatorMap.get(createdById) ?? null,
      collection: collectionMap.get(r.collectionId) ?? null,
      access: accessByDoc.get(r.id) ?? [],
    }));

    return res.json(paginatedResponse(items, total, page, pageSize));
  }

  const where: Record<string, unknown> = {};
  if (docType) where.docType = docType;
  if (category) where.category = category;
  if (collectionId) where.collectionId = Number(collectionId);
  if (tag) where.tags = { has: tag };

  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, select: listSelect, orderBy: { updatedAt: "desc" }, skip, take }),
    prisma.document.count({ where }),
  ]);
  const accessByDoc = await listRecordAccessBatch(ENTITY_TYPE, items.map((d) => d.id));
  res.json(paginatedResponse(items.map((d) => ({ ...d, access: accessByDoc.get(d.id) ?? [] })), total, page, pageSize));
}

// Feeds the Netflix-style library dashboard: a flat, unpaginated list (capped well above any
// realistic library size) that the client groups client-side into shelves (recently updated,
// review due, one per doc type) rather than the server pre-computing every possible shelf.
export async function libraryFeed(_req: Request, res: Response) {
  const items = await prisma.document.findMany({
    select: listSelect,
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const accessByDoc = await listRecordAccessBatch(ENTITY_TYPE, items.map((d) => d.id));
  res.json(items.map((d) => ({ ...d, access: accessByDoc.get(d.id) ?? [] })));
}

export async function getOne(req: Request, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: Number(req.params.id) }, include: detailInclude });
  if (!doc) throw new ApiError(404, "Document not found");
  res.json({ ...doc, access: await listRecordAccess(ENTITY_TYPE, doc.id) });
}

export async function create(req: Request, res: Response) {
  const { title, docType, category, collectionId, summary, sections, tags, isPublished, reviewDueDate, access } = req.body;

  const sectionsSchema = SECTIONS_SCHEMA_BY_TYPE[docType as DocTypeValue];
  const parsedSections = sectionsSchema.parse(sections ?? {});

  const doc = await prisma.document.create({
    data: {
      title,
      docType,
      category,
      collectionId,
      summary,
      sections: parsedSections,
      tags: tags ?? [],
      isPublished: isPublished ?? true,
      reviewDueDate: reviewDueDate ? new Date(reviewDueDate) : null,
      searchText: buildSearchText({ title, summary, sections: parsedSections, tags: tags ?? [] }),
      createdById: req.user!.id,
    },
    include: detailInclude,
  });
  for (const grant of (access ?? []) as { userId?: number; teamId?: number; level: "EDIT" | "DELETE" }[]) {
    const target = grant.userId != null ? { userId: grant.userId } : { teamId: grant.teamId! };
    await grantRecordAccess(ENTITY_TYPE, doc.id, target, grant.level, req.user!.id);
  }
  await logAudit({ userId: req.user!.id, action: "docs.create", entityType: "Document", entityId: doc.id });
  res.status(201).json({ ...doc, access: await listRecordAccess(ENTITY_TYPE, doc.id) });
  void syncDocumentToGit(doc.id, "create");
}

// Editing/deleting is restricted to the creator, System/Super Admin, and anyone explicitly
// granted EDIT/DELETE access (see server/src/lib/recordAccess.ts) — requirePermission("docs",
// "edit"/"delete") still gates whether the user's role can touch documents at all, not whether
// they may touch *this* one.
export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Document not found");

  const canEdit = await hasRecordAccess(ENTITY_TYPE, id, existing, req.user!.id, req.user!.roleName, "EDIT");
  if (!canEdit) throw new ApiError(403, "Only the document's creator or someone they've granted edit access to can update it");

  const { title, category, collectionId, summary, sections, tags, isPublished, reviewDueDate } = req.body;

  const sectionsSchema = SECTIONS_SCHEMA_BY_TYPE[existing.docType as DocTypeValue];
  const parsedSections = sections !== undefined ? sectionsSchema.parse(sections) : (existing.sections as Record<string, unknown>);

  const nextTitle = title ?? existing.title;
  const nextSummary = summary ?? existing.summary;
  const nextTags = tags ?? existing.tags;

  const doc = await prisma.document.update({
    where: { id },
    data: {
      title: nextTitle,
      category: category ?? existing.category,
      collectionId: collectionId ?? existing.collectionId,
      summary: nextSummary,
      sections: parsedSections,
      tags: nextTags,
      isPublished: isPublished ?? existing.isPublished,
      reviewDueDate: reviewDueDate !== undefined ? (reviewDueDate ? new Date(reviewDueDate) : null) : existing.reviewDueDate,
      searchText: buildSearchText({ title: nextTitle, summary: nextSummary, sections: parsedSections, tags: nextTags }),
    },
    include: detailInclude,
  });
  await logAudit({ userId: req.user!.id, action: "docs.update", entityType: "Document", entityId: id });
  res.json({ ...doc, access: await listRecordAccess(ENTITY_TYPE, id) });
  void syncDocumentToGit(doc.id, "update");
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Document not found");

  const canDelete = await hasRecordAccess(ENTITY_TYPE, id, existing, req.user!.id, req.user!.roleName, "DELETE");
  if (!canDelete) throw new ApiError(403, "Only the document's creator, someone they've granted delete access to, or a System/Super Admin can delete it");

  await prisma.recordAccessGrant.deleteMany({ where: { entityType: ENTITY_TYPE, entityId: id } });
  await prisma.document.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "docs.delete", entityType: "Document", entityId: id });
  res.json({ ok: true });
}

// ───────────────────────── Access grants (creator-only grant/revoke, EDIT or DELETE) ─────────────────────────

export async function grantAccess(req: Request, res: Response) {
  const id = Number(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Document not found");
  if (doc.createdById !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only the document's creator can grant access");
  }
  const { userId, teamId, level } = req.body as { userId?: number; teamId?: number; level: "EDIT" | "DELETE" | "DUPLICATE" };
  const target = userId != null ? { userId } : { teamId: teamId! };
  await grantRecordAccess(ENTITY_TYPE, id, target, level, req.user!.id);
  await logAudit({ userId: req.user!.id, action: "docs.access.grant", entityType: "Document", entityId: id, metadata: { userId, teamId, level } });
  res.json(await listRecordAccess(ENTITY_TYPE, id));
}

export async function revokeAccess(req: Request, res: Response) {
  const id = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const level = req.params.level === "DELETE" ? "DELETE" : req.params.level === "DUPLICATE" ? "DUPLICATE" : "EDIT";
  const target = req.params.kind === "team" ? { teamId: targetId } : { userId: targetId };
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Document not found");
  if (doc.createdById !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only the document's creator can revoke access");
  }
  await revokeRecordAccess(ENTITY_TYPE, id, target, level);
  await logAudit({ userId: req.user!.id, action: "docs.access.revoke", entityType: "Document", entityId: id, metadata: { ...target, level } });
  res.json(await listRecordAccess(ENTITY_TYPE, id));
}

// Created unpublished (and never git-synced, since externalKey stays null) — a duplicate is a
// starting point to edit further, not a second copy of a live SOP the library should surface as
// equally authoritative until someone reviews and publishes it.
export async function duplicate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const source = await prisma.document.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Document not found");

  const canDuplicate = await hasRecordAccess(ENTITY_TYPE, id, source, req.user!.id, req.user!.roleName, "DUPLICATE");
  if (!canDuplicate) throw new ApiError(403, "Only the document's creator or someone they've granted duplicate access to can duplicate it");

  const title = `${source.title} (Copy)`;
  const sections = source.sections as Record<string, unknown>;
  const clone = await prisma.document.create({
    data: {
      title,
      docType: source.docType,
      category: source.category,
      collectionId: source.collectionId,
      summary: source.summary,
      sections: sections as Prisma.InputJsonValue,
      tags: source.tags,
      isPublished: false,
      reviewDueDate: source.reviewDueDate,
      searchText: buildSearchText({ title, summary: source.summary, sections, tags: source.tags }),
      createdById: req.user!.id,
    },
    include: detailInclude,
  });
  await logAudit({ userId: req.user!.id, action: "docs.duplicate", entityType: "Document", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
}

export async function uploadAttachment(req: Request, res: Response) {
  const documentId = Number(req.params.id);
  if (!req.file) throw new ApiError(400, "No file uploaded");

  // `url` stores the on-disk filename only (not a public path) — attachments are internal
  // documents (SOPs, finance/technical material), so they're served through the authenticated
  // downloadAttachment route below rather than a public express.static mount.
  const attachment = await prisma.documentAttachment.create({
    data: { documentId, fileName: req.file.originalname, url: req.file.filename },
  });
  await logAudit({ userId: req.user!.id, action: "docs.attachment_upload", entityType: "Document", entityId: documentId });
  res.status(201).json(attachment);
}

export async function downloadAttachment(req: Request, res: Response) {
  const documentId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const attachment = await prisma.documentAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.documentId !== documentId) throw new ApiError(404, "Attachment not found");

  const diskPath = path.join(UPLOAD_ROOT, path.basename(attachment.url));
  if (!fs.existsSync(diskPath)) throw new ApiError(404, "File no longer exists on disk");
  res.download(diskPath, attachment.fileName);
}

export async function removeAttachment(req: Request, res: Response) {
  const documentId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const attachment = await prisma.documentAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.documentId !== documentId) throw new ApiError(404, "Attachment not found");
  await prisma.documentAttachment.delete({ where: { id: attachmentId } });
  const diskPath = path.join(UPLOAD_ROOT, path.basename(attachment.url));
  fs.unlink(diskPath, () => {}); // best-effort cleanup; DB row is the source of truth either way
  await logAudit({ userId: req.user!.id, action: "docs.attachment_delete", entityType: "Document", entityId: documentId });
  res.json({ ok: true });
}

// Distinct category values already in use, so the client's category picker can suggest existing
// ones (via a datalist) while still allowing a free-typed new category.
export async function categories(_req: Request, res: Response) {
  const rows = await prisma.document.findMany({ select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } });
  res.json(rows.map((r) => r.category));
}

export async function stats(req: Request, res: Response) {
  const { docType, category } = req.query as Record<string, string | undefined>;
  const where = {
    ...(docType ? { docType: docType as any } : {}),
    ...(category ? { category } : {}),
  };
  const [total, byCategory, byType, reviewOverdueCount] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.groupBy({ by: ["category"], where, _count: { _all: true } }),
    prisma.document.groupBy({ by: ["docType"], where, _count: { _all: true } }),
    prisma.document.count({ where: { ...where, reviewDueDate: { lt: new Date() } } }),
  ]);

  res.json({
    total,
    byCategory: byCategory.map((g) => ({ category: g.category, count: g._count._all })),
    byType: byType.map((g) => ({ docType: g.docType, count: g._count._all })),
    reviewOverdueCount,
  });
}

// ───────────────────────── Collections ─────────────────────────
// Every document belongs to exactly one collection. Unlike docType/category, collections are a
// small managed list (create/rename/delete) rather than free text, so they get their own CRUD.

export async function listCollections(_req: Request, res: Response) {
  const collections = await prisma.docCollection.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: true } } },
  });
  res.json(collections.map((c) => ({ id: c.id, name: c.name, description: c.description, documentCount: c._count.documents })));
}

export async function createCollection(req: Request, res: Response) {
  const collection = await prisma.docCollection.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "docs.collection_create", entityType: "DocCollection", entityId: collection.id });
  res.status(201).json(collection);
}

export async function updateCollection(req: Request, res: Response) {
  const id = Number(req.params.id);
  const collection = await prisma.docCollection.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "docs.collection_update", entityType: "DocCollection", entityId: id });
  res.json(collection);
}

export async function removeCollection(req: Request, res: Response) {
  const id = Number(req.params.id);
  const documentCount = await prisma.document.count({ where: { collectionId: id } });
  if (documentCount > 0) {
    throw new ApiError(409, `This collection has ${documentCount} document(s) in it — move or delete them first.`);
  }
  await prisma.docCollection.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "docs.collection_delete", entityType: "DocCollection", entityId: id });
  res.json({ ok: true });
}

// ───────────────────────── Export (PDF/Word) + Import (PDF/Word) ─────────────────────────

// Reads the org-wide watermark image + position straight off disk rather than through
// docsGitSync-style export helpers, matching how buildDocTemplateBuffer/docExport.ts stay
// pure/IO-free — the file lives under the same uploads/branding directory + static mount that
// settings.routes.ts's appIcon/favicon uploads already use.
async function loadDocsWatermark(): Promise<WatermarkAsset | null> {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ["docsWatermarkUrl", "docsWatermarkPosition"] } } });
  const url = settings.find((s) => s.key === "docsWatermarkUrl")?.value;
  if (!url) return null;
  const position = (settings.find((s) => s.key === "docsWatermarkPosition")?.value as WatermarkPosition | undefined) ?? "center";

  const filename = path.basename(url);
  const filePath = path.join(__dirname, "..", "..", "..", "uploads", "branding", filename);
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  const dims = readImageDimensions(buffer);
  if (!dims) return null;

  const docxType: WatermarkAsset["docxType"] = path.extname(filename).toLowerCase() === ".png" ? "png" : "jpg";
  return { buffer, width: dims.width, height: dims.height, position, docxType };
}

export async function exportDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const format = req.query.format === "docx" ? "docx" : "pdf";
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Document not found");

  const exportable = {
    title: doc.title,
    docType: doc.docType as DocTypeValue,
    category: doc.category,
    summary: doc.summary,
    sections: doc.sections as Record<string, unknown>,
    tags: doc.tags,
    updatedAt: doc.updatedAt,
  };
  const safeName = doc.title.replace(/[^a-z0-9-_]+/gi, "_");
  const watermark = await loadDocsWatermark();
  const companyNameSetting = await prisma.systemSetting.findUnique({ where: { key: "companyName" } });
  const companyName = companyNameSetting?.value ?? null;

  await logAudit({ userId: req.user!.id, action: "docs.export", entityType: "Document", entityId: id, metadata: { format } });

  if (format === "docx") {
    const buffer = await buildDocDocxBuffer(exportable, watermark, companyName);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
    res.send(buffer);
  } else {
    const buffer = await buildDocPdfBuffer(exportable, watermark, companyName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    res.send(buffer);
  }
}

// Always lands as a GENERAL document — see docImport.ts for why a converted PDF/Word file can't be
// reliably mapped onto a typed docType's structured sections.
const DOCS_IMPORT_MAX_FILES_KEY = "docsImportMaxFiles";
const DEFAULT_IMPORT_MAX_FILES = 5;

// A single per-org SystemSetting (see settings.routes.ts's identical key/value pattern), editable
// from two admin surfaces — Admin & Setup (Super Admin) and App Settings (System Admin) — both
// hitting this same docs-scoped route rather than the generic /api/settings one, since that's
// gated to "app-settings" edit which Super Admin is deliberately excluded from.
export async function getImportSettings(_req: Request, res: Response) {
  const setting = await prisma.systemSetting.findUnique({ where: { key: DOCS_IMPORT_MAX_FILES_KEY } });
  res.json({ maxFiles: setting ? Number(setting.value) : DEFAULT_IMPORT_MAX_FILES });
}

export async function updateImportSettings(req: Request, res: Response) {
  const maxFiles = Number(req.body.maxFiles);
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 50) throw new ApiError(400, "maxFiles must be a whole number between 1 and 50");
  await prisma.systemSetting.upsert({
    where: { key: DOCS_IMPORT_MAX_FILES_KEY },
    update: { value: String(maxFiles) },
    create: { key: DOCS_IMPORT_MAX_FILES_KEY, value: String(maxFiles) },
  });
  await logAudit({ userId: req.user!.id, action: "docs.import_settings.update", metadata: { maxFiles } });
  res.json({ maxFiles });
}

export async function downloadTemplate(req: Request, res: Response) {
  const docType = docTypeSchema.parse(req.params.docType);
  const buffer = await buildDocTemplateBuffer(docType);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${docType.toLowerCase()}_template.docx"`);
  res.send(buffer);
}

export async function importDocument(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const collectionId = Number(req.body.collectionId);
  if (!collectionId) throw new ApiError(400, "collectionId is required");

  const isDocx = req.file.mimetype.includes("wordprocessingml") || /\.docx$/i.test(req.file.originalname);
  const requestedDocType = docTypeSchema.safeParse(req.body.docType);
  const title = req.file.originalname.replace(/\.(docx|pdf)$/i, "") || "Imported Document";

  let docType: DocTypeValue = "GENERAL";
  let sections: Record<string, unknown>;
  let unmatchedHeadings: string[] = [];

  if (isDocx && requestedDocType.success) {
    docType = requestedDocType.data;
    const result = await convertDocxToSections(req.file.buffer, docType);
    sections = result.sections;
    unmatchedHeadings = result.unmatchedHeadings;
  } else {
    const html = await convertUploadToHtml(req.file.buffer, req.file.mimetype, req.file.originalname);
    sections = { body: html };
  }

  const doc = await prisma.document.create({
    data: {
      title,
      docType,
      category: "Imported",
      collectionId,
      summary: null,
      sections: sections as Prisma.InputJsonValue,
      tags: [],
      isPublished: false,
      searchText: buildSearchText({ title, summary: null, sections, tags: [] }),
      createdById: req.user!.id,
    },
    include: detailInclude,
  });
  await logAudit({ userId: req.user!.id, action: "docs.import", entityType: "Document", entityId: doc.id, metadata: { fileName: req.file.originalname, docType, unmatchedHeadings } });
  res.status(201).json({ ...doc, access: await listRecordAccess(ENTITY_TYPE, doc.id), unmatchedHeadings });
  void syncDocumentToGit(doc.id, "create");
}
