import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { parseCsvBuffer, toCsv } from "../../lib/csv";

const include = {
  category: true,
  location: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  device: true,
};

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const { search, status, categoryId, locationId, assignedToId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { assetTag: { contains: search, mode: "insensitive" } },
      { serialNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (categoryId) where.categoryId = Number(categoryId);
  if (locationId) where.locationId = Number(locationId);
  if (assignedToId) where.assignedToId = Number(assignedToId);
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.asset.findMany({ where, include, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.asset.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
}

export async function getByTag(req: Request, res: Response) {
  const asset = await prisma.asset.findUnique({ where: { assetTag: req.params.tag }, include });
  if (!asset) throw new ApiError(404, "No asset found with that tag");
  res.json(asset);
}

export async function stats(_req: Request, res: Response) {
  const [total, byCategory, categories] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.assetCategory.findMany(),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  res.json({
    total,
    byCategory: byCategory.map((g) => ({
      categoryId: g.categoryId,
      name: g.categoryId ? categoryMap.get(g.categoryId) ?? "Unknown" : "Uncategorized",
      count: g._count._all,
    })),
  });
}

export async function getOne(req: Request, res: Response) {
  const asset = await prisma.asset.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...include,
      tickets: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!asset) throw new ApiError(404, "Asset not found");
  res.json(asset);
}

export async function history(req: Request, res: Response) {
  const id = Number(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "Asset", entityId: id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(logs);
}

export async function create(req: Request, res: Response) {
  const asset = await prisma.asset.create({ data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "asset.create", entityType: "Asset", entityId: asset.id });
  res.status(201).json(asset);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const asset = await prisma.asset.update({ where: { id }, data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "asset.update", entityType: "Asset", entityId: id, metadata: req.body });
  res.json(asset);
}

export async function duplicate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const source = await prisma.asset.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Asset not found");

  let newTag = `${source.assetTag}-COPY`;
  let suffix = 1;
  while (await prisma.asset.findUnique({ where: { assetTag: newTag } })) {
    suffix += 1;
    newTag = `${source.assetTag}-COPY${suffix}`;
  }

  const clone = await prisma.asset.create({
    data: {
      assetTag: newTag,
      name: source.name,
      categoryId: source.categoryId,
      locationId: source.locationId,
      status: source.status,
      manufacturer: source.manufacturer,
      model: source.model,
      notes: source.notes,
    },
    include,
  });

  await logAudit({ userId: req.user!.id, action: "asset.duplicate", entityType: "Asset", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.asset.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "asset.delete", entityType: "Asset", entityId: id });
  res.json({ ok: true });
}

const EXPORT_COLUMNS = [
  "assetTag",
  "name",
  "status",
  "manufacturer",
  "model",
  "serialNumber",
  "category",
  "location",
  "assignedTo",
];

export async function exportCsv(_req: Request, res: Response) {
  const assets = await prisma.asset.findMany({ include, orderBy: { assetTag: "asc" } });
  const rows = assets.map((a) => ({
    assetTag: a.assetTag,
    name: a.name,
    status: a.status,
    manufacturer: a.manufacturer ?? "",
    model: a.model ?? "",
    serialNumber: a.serialNumber ?? "",
    category: a.category?.name ?? "",
    location: a.location?.name ?? "",
    assignedTo: a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : "",
  }));
  const csv = toCsv(rows, EXPORT_COLUMNS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=assets.csv");
  res.send(csv);
}

export async function exportJson(_req: Request, res: Response) {
  const assets = await prisma.asset.findMany({ include, orderBy: { assetTag: "asc" } });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=assets.json");
  res.send(JSON.stringify(assets, null, 2));
}

export async function importCsv(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const rows = parseCsvBuffer(req.file.buffer);

  const categories = await prisma.assetCategory.findMany();
  const locations = await prisma.location.findMany();
  const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const locationMap = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));

  let created = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    if (!row.assetTag || !row.name) {
      errors.push(`Row ${index + 2}: assetTag and name are required`);
      continue;
    }
    try {
      await prisma.asset.create({
        data: {
          assetTag: row.assetTag,
          name: row.name,
          status: (row.status as never) || "IN_USE",
          manufacturer: row.manufacturer || undefined,
          model: row.model || undefined,
          serialNumber: row.serialNumber || undefined,
          categoryId: row.category ? categoryMap.get(row.category.toLowerCase()) : undefined,
          locationId: row.location ? locationMap.get(row.location.toLowerCase()) : undefined,
        },
      });
      created += 1;
    } catch (err) {
      errors.push(`Row ${index + 2}: ${(err as Error).message}`);
    }
  }

  await logAudit({ userId: req.user!.id, action: "asset.import", metadata: { created, errorCount: errors.length } });
  res.json({ created, errors });
}
