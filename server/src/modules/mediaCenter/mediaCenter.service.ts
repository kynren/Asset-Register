import fs from "fs";
import path from "path";
import { MediaAssetType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { readImageDimensions } from "../../lib/imageDimensions";

const UPLOADS_ROOT = path.join(__dirname, "..", "..", "..", "uploads");
const MEDIA_CENTER_DIR = path.join(UPLOADS_ROOT, "media-center");
const ASSET_PHOTOS_DIR = path.join(UPLOADS_ROOT, "assets", "photos");
const DOCS_DIR = path.join(UPLOADS_ROOT, "docs");
const TICKETS_DIR = path.join(UPLOADS_ROOT, "tickets");
const SITEMAPS_DIR = path.join(UPLOADS_ROOT, "lighting-sitemaps");
const AVATARS_DIR = path.join(UPLOADS_ROOT, "avatars");
const STOCK_ATTACHMENTS_DIR = path.join(UPLOADS_ROOT, "stock-attachments");

function statSize(diskPath: string): { sizeBytes: number | null; missing: boolean } {
  try {
    return { sizeBytes: fs.statSync(diskPath).size, missing: false };
  } catch {
    return { sizeBytes: null, missing: true };
  }
}

function unlinkIfExists(diskPath: string) {
  try {
    fs.unlinkSync(diskPath);
  } catch {
    // already gone, or never existed on this disk — nothing more to clean up
  }
}

// ---------------------------------------------------------------------------
// Media Library — standalone uploads (WordPress-style: upload now, attach later via
// RichTextEditor's "Insert from Media Library" picker). See MediaAsset in schema.prisma.
// ---------------------------------------------------------------------------

function detectType(mimeType: string): MediaAssetType {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (/pdf|word|officedocument|text\/|csv|json/.test(mimeType)) return "DOCUMENT";
  return "OTHER";
}

export async function uploadAsset(file: Express.Multer.File, userId: number) {
  const type = detectType(file.mimetype);
  let width: number | null = null;
  let height: number | null = null;
  if (type === "IMAGE") {
    try {
      const dims = readImageDimensions(fs.readFileSync(file.path));
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    } catch {
      // dimension parsing is best-effort — a format the parser doesn't recognize (webp/gif/svg)
      // just leaves width/height null rather than failing the upload
    }
  }
  return prisma.mediaAsset.create({
    data: {
      filename: file.filename,
      originalName: file.originalname,
      url: `/uploads/media-center/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      type,
      width,
      height,
      uploadedById: userId,
    },
  });
}

export interface ListLibraryParams {
  page: number;
  pageSize: number;
  search?: string;
  type?: string;
}

export async function listLibrary(params: ListLibraryParams) {
  const where: Record<string, unknown> = {};
  if (params.search?.trim()) {
    where.OR = [
      { originalName: { contains: params.search, mode: "insensitive" } },
      { title: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (params.type) where.type = params.type;

  const [rows, total] = await Promise.all([
    prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (params.page - 1) * params.pageSize, take: params.pageSize }),
    prisma.mediaAsset.count({ where }),
  ]);
  return { rows, total, page: params.page, pageSize: params.pageSize, totalPages: Math.max(1, Math.ceil(total / params.pageSize)) };
}

export async function updateAsset(id: number, data: { title?: string | null; altText?: string | null; caption?: string | null; description?: string | null }) {
  try {
    return await prisma.mediaAsset.update({ where: { id }, data });
  } catch (err: any) {
    if (err?.code === "P2025") throw new ApiError(404, "Record not found");
    throw err;
  }
}

export async function deleteAsset(id: number) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw new ApiError(404, "Record not found");
  await prisma.mediaAsset.delete({ where: { id } });
  unlinkIfExists(path.join(MEDIA_CENTER_DIR, asset.filename));
}

// ---------------------------------------------------------------------------
// Attached media — read (+ delete where safe) view across everything already uploaded via other
// features' own sub-resource flows (asset photos, doc/ticket/project attachments, avatars). Each
// entry knows its own model shape and disk-path convention; deliberately NOT a generic loop since
// the shapes genuinely differ (bare filename vs full "/uploads/..." URL, different upload dirs).
// Explicitly out of scope (see plan): org logo (control-plane, not tenant data), camera
// recordings (own retention UI already manages their lifecycle), email-template inline images
// (stored inside a JSON blob, not a plain column).
// ---------------------------------------------------------------------------

export interface AttachedItem {
  sourceKey: string;
  id: number;
  displayName: string;
  url: string | null;
  sizeBytes: number | null;
  missing: boolean;
  createdAt: Date;
}

interface AttachedSource {
  key: string;
  label: string;
  list: (limit: number) => Promise<AttachedItem[]>;
  remove: (id: number) => Promise<void>;
  // Absolute disk path for the preview route to stream back (res.sendFile infers Content-Type
  // from the extension automatically) — null if the row or the underlying file doesn't exist.
  resolvePath: (id: number) => Promise<string | null>;
}

function existingOrNull(p: string): string | null {
  return fs.existsSync(p) ? p : null;
}

const SOURCES: AttachedSource[] = [
  {
    key: "assetPhotos",
    label: "Asset Photos",
    list: async (limit) => {
      const rows = await prisma.assetPhoto.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { asset: { select: { name: true } } } });
      return rows.map((r) => {
        const { sizeBytes, missing } = statSize(path.join(ASSET_PHOTOS_DIR, path.basename(r.url)));
        return { sourceKey: "assetPhotos", id: r.id, displayName: r.asset?.name ? `Photo — ${r.asset.name}` : `Photo #${r.id}`, url: r.url, sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    remove: async (id) => {
      const row = await prisma.assetPhoto.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "Record not found");
      await prisma.assetPhoto.delete({ where: { id } });
      unlinkIfExists(path.join(ASSET_PHOTOS_DIR, path.basename(row.url)));
    },
    resolvePath: async (id) => {
      const row = await prisma.assetPhoto.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(ASSET_PHOTOS_DIR, path.basename(row.url))) : null;
    },
  },
  {
    key: "docAttachments",
    label: "Doc Attachments",
    list: async (limit) => {
      const rows = await prisma.documentAttachment.findMany({ orderBy: { createdAt: "desc" }, take: limit });
      return rows.map((r) => {
        const { sizeBytes, missing } = statSize(path.join(DOCS_DIR, path.basename(r.url)));
        return { sourceKey: "docAttachments", id: r.id, displayName: r.fileName, url: null, sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    remove: async (id) => {
      const row = await prisma.documentAttachment.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "Record not found");
      await prisma.documentAttachment.delete({ where: { id } });
      unlinkIfExists(path.join(DOCS_DIR, path.basename(row.url)));
    },
    resolvePath: async (id) => {
      const row = await prisma.documentAttachment.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(DOCS_DIR, path.basename(row.url))) : null;
    },
  },
  {
    key: "ticketAttachments",
    label: "Ticket Attachments",
    list: async (limit) => {
      const rows = await prisma.ticketAttachment.findMany({ orderBy: { createdAt: "desc" }, take: limit });
      return rows.map((r) => {
        const diskPath = path.join(TICKETS_DIR, path.basename(r.storedPath));
        const { missing } = statSize(diskPath);
        return { sourceKey: "ticketAttachments", id: r.id, displayName: r.filename, url: null, sizeBytes: r.sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    remove: async (id) => {
      const row = await prisma.ticketAttachment.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "Record not found");
      await prisma.ticketAttachment.delete({ where: { id } });
      unlinkIfExists(path.join(TICKETS_DIR, path.basename(row.storedPath)));
    },
    resolvePath: async (id) => {
      const row = await prisma.ticketAttachment.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(TICKETS_DIR, path.basename(row.storedPath))) : null;
    },
  },
  {
    key: "projectAttachments",
    label: "Project Attachments",
    list: async (limit) => {
      const rows = await prisma.projectCardAttachment.findMany({ orderBy: { createdAt: "desc" }, take: limit });
      return rows.map((r) => {
        const diskPath = path.join(UPLOADS_ROOT, r.url.replace(/^\/?uploads\//, ""));
        const { sizeBytes, missing } = statSize(diskPath);
        return { sourceKey: "projectAttachments", id: r.id, displayName: r.fileName, url: r.url, sizeBytes: r.sizeBytes ?? sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    remove: async (id) => {
      const row = await prisma.projectCardAttachment.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "Record not found");
      await prisma.projectCardAttachment.delete({ where: { id } });
      unlinkIfExists(path.join(UPLOADS_ROOT, row.url.replace(/^\/?uploads\//, "")));
    },
    resolvePath: async (id) => {
      const row = await prisma.projectCardAttachment.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(UPLOADS_ROOT, row.url.replace(/^\/?uploads\//, ""))) : null;
    },
  },
  {
    key: "siteMaps",
    label: "Lighting Site Maps",
    list: async (limit) => {
      const rows = await prisma.lightingSiteMap.findMany({ orderBy: { createdAt: "desc" }, take: limit });
      return rows.map((r) => {
        const { sizeBytes, missing } = statSize(path.join(SITEMAPS_DIR, path.basename(r.imageUrl)));
        return { sourceKey: "siteMaps", id: r.id, displayName: r.name, url: r.imageUrl, sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    // A site map's image is a required field of a still-in-use map, not a detachable file — point
    // admins at the real editor (which handles re-uploading/replacing it safely) instead of
    // letting this view leave a site map with a dangling imageUrl.
    remove: async () => {
      throw new ApiError(400, "Site map images are managed from the Lighting → Site Map editor, not here.");
    },
    resolvePath: async (id) => {
      const row = await prisma.lightingSiteMap.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(SITEMAPS_DIR, path.basename(row.imageUrl))) : null;
    },
  },
  {
    key: "avatars",
    label: "Avatars",
    list: async (limit) => {
      const rows = await prisma.userImage.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { user: { select: { firstName: true, lastName: true } } } });
      return rows.map((r) => {
        const { sizeBytes, missing } = statSize(path.join(AVATARS_DIR, path.basename(r.url)));
        const name = `${r.user?.firstName ?? ""} ${r.user?.lastName ?? ""}`.trim();
        return { sourceKey: "avatars", id: r.id, displayName: name ? `Avatar — ${name}` : `Avatar #${r.id}`, url: r.url, sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    remove: async (id) => {
      const row = await prisma.userImage.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "Record not found");
      await prisma.userImage.delete({ where: { id } });
      unlinkIfExists(path.join(AVATARS_DIR, path.basename(row.url)));
    },
    resolvePath: async (id) => {
      const row = await prisma.userImage.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(AVATARS_DIR, path.basename(row.url))) : null;
    },
  },
  {
    key: "stockAttachments",
    label: "Stock Item Attachments",
    list: async (limit) => {
      const rows = await prisma.stockItemAttachment.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { stockItem: { select: { name: true } } } });
      return rows.map((r) => {
        const diskPath = path.join(STOCK_ATTACHMENTS_DIR, path.basename(r.url));
        const { sizeBytes, missing } = statSize(diskPath);
        const name = r.originalName ?? `Attachment #${r.id}`;
        return { sourceKey: "stockAttachments", id: r.id, displayName: r.stockItem?.name ? `${name} — ${r.stockItem.name}` : name, url: r.url, sizeBytes, missing, createdAt: r.createdAt };
      });
    },
    remove: async (id) => {
      const row = await prisma.stockItemAttachment.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "Record not found");
      await prisma.stockItemAttachment.delete({ where: { id } });
      unlinkIfExists(path.join(STOCK_ATTACHMENTS_DIR, path.basename(row.url)));
    },
    resolvePath: async (id) => {
      const row = await prisma.stockItemAttachment.findUnique({ where: { id } });
      return row ? existingOrNull(path.join(STOCK_ATTACHMENTS_DIR, path.basename(row.url))) : null;
    },
  },
];

// Absolute disk path for the preview route — reuses the same per-source path convention as
// list()/remove() above. Sources with a public url (assetPhotos/projectAttachments/siteMaps/
// avatars) already serve fine via their existing static mount, so the client only needs this for
// the ones that don't (docAttachments/ticketAttachments); exposed uniformly for every source
// anyway so the client doesn't need to special-case which sources are public.
export async function getAttachedDiskPath(sourceKey: string, id: number): Promise<string | null> {
  const source = SOURCES.find((s) => s.key === sourceKey);
  if (!source) throw new ApiError(404, "Unknown media source");
  return source.resolvePath(id);
}

export function getAttachedSources() {
  return SOURCES.map((s) => ({ key: s.key, label: s.label }));
}

export async function listAttached(sourceKey?: string, limit = 60): Promise<AttachedItem[]> {
  if (sourceKey) {
    const source = SOURCES.find((s) => s.key === sourceKey);
    if (!source) throw new ApiError(404, "Unknown media source");
    return source.list(limit);
  }
  // "All sources" fans out a bounded per-source query and merge-sorts by date — true cross-model
  // server-side pagination across heterogeneous tables isn't practical here, so this is
  // approximate beyond the first page; picking a specific source filter paginates exactly.
  const perSourceLimit = Math.max(10, Math.ceil(limit / SOURCES.length));
  const lists = await Promise.all(SOURCES.map((s) => s.list(perSourceLimit)));
  return lists
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function removeAttached(sourceKey: string, id: number): Promise<void> {
  const source = SOURCES.find((s) => s.key === sourceKey);
  if (!source) throw new ApiError(404, "Unknown media source");
  await source.remove(id);
}
