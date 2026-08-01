import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { syncDocumentToGit } from "../../lib/docsGitSync";
import { DocTypeValue, SECTIONS_SCHEMA_BY_TYPE } from "./docs.schema";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "docs");

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
    const items = rows.map(({ createdById, ...r }) => ({ ...r, createdBy: creatorMap.get(createdById) ?? null, collection: collectionMap.get(r.collectionId) ?? null }));

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
  res.json(paginatedResponse(items, total, page, pageSize));
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
  res.json(items);
}

export async function getOne(req: Request, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: Number(req.params.id) }, include: detailInclude });
  if (!doc) throw new ApiError(404, "Document not found");
  res.json(doc);
}

export async function create(req: Request, res: Response) {
  const { title, docType, category, collectionId, summary, sections, tags, isPublished, reviewDueDate } = req.body;

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
  await logAudit({ userId: req.user!.id, action: "docs.create", entityType: "Document", entityId: doc.id });
  res.status(201).json(doc);
  void syncDocumentToGit(doc.id, "create");
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Document not found");

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
  res.json(doc);
  void syncDocumentToGit(doc.id, "update");
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.document.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "docs.delete", entityType: "Document", entityId: id });
  res.json({ ok: true });
}

// Created unpublished (and never git-synced, since externalKey stays null) — a duplicate is a
// starting point to edit further, not a second copy of a live SOP the library should surface as
// equally authoritative until someone reviews and publishes it.
export async function duplicate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const source = await prisma.document.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Document not found");

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
