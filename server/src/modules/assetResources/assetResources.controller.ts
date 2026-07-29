import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { RESOURCE_CONFIG } from "./assetResources.config";
import { ASSET_RESOURCE_UPLOAD_ROOT } from "./assetResources.routes";

function delegate(model: string) {
  return (prisma as unknown as Record<string, any>)[model];
}

async function assertAssetExists(assetId: number) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, "Asset not found");
}

export async function listResource(req: Request, res: Response) {
  const assetId = Number(req.params.assetId);
  const config = RESOURCE_CONFIG[req.params.resource];
  const items = await delegate(config.model).findMany({ where: { assetId }, orderBy: { createdAt: "desc" } });
  res.json(items);
}

export async function createResource(req: Request, res: Response) {
  const assetId = Number(req.params.assetId);
  const resourceKey = req.params.resource;
  const config = RESOURCE_CONFIG[resourceKey];
  await assertAssetExists(assetId);

  const data: Record<string, unknown> = { assetId };

  if (config.isFile) {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = files?.[0];
    if (!file && !config.fileOptional) throw new ApiError(400, "A file is required for this resource");
    if (file) {
      data[config.urlField!] = `/uploads/assets/${resourceKey}/${file.filename}`;
      if (config.model === "assetDocument") data.sizeBytes = file.size;
    }
  }

  const rawFields: Record<string, unknown> = { ...req.body };
  if (config.model === "assetVolume") {
    if (rawFields.totalGb !== undefined) rawFields.totalGb = Number(rawFields.totalGb);
    if (rawFields.freeGb !== undefined) rawFields.freeGb = Number(rawFields.freeGb);
  }
  if (config.model === "assetNetworkPort" && rawFields.portNumber !== undefined) {
    rawFields.portNumber = Number(rawFields.portNumber);
  }

  const parsed = config.schema.safeParse(rawFields);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors.map((e) => e.message).join(", "));

  const fields: Record<string, unknown> = { ...parsed.data };
  if (config.model === "assetContract") {
    if (fields.startDate) fields.startDate = new Date(fields.startDate as string);
    if (fields.endDate) fields.endDate = new Date(fields.endDate as string);
  }

  Object.assign(data, fields);

  const created = await delegate(config.model).create({ data });
  await logAudit({ userId: req.user!.id, action: `asset.${resourceKey}.create`, entityType: "Asset", entityId: assetId, metadata: { resourceKey, id: created.id } });
  res.status(201).json(created);
}

export async function removeResource(req: Request, res: Response) {
  const assetId = Number(req.params.assetId);
  const resourceKey = req.params.resource;
  const config = RESOURCE_CONFIG[resourceKey];
  const itemId = Number(req.params.itemId);

  const item = await delegate(config.model).findUnique({ where: { id: itemId } });
  if (!item || item.assetId !== assetId) throw new ApiError(404, "Not found");

  await delegate(config.model).delete({ where: { id: itemId } });

  if (config.isFile && config.urlField) {
    const url = item[config.urlField] as string | null;
    if (url) {
      const filePath = path.join(ASSET_RESOURCE_UPLOAD_ROOT, resourceKey, path.basename(url));
      if (fs.existsSync(filePath)) fs.unlink(filePath, () => undefined);
    }
  }

  await logAudit({ userId: req.user!.id, action: `asset.${resourceKey}.delete`, entityType: "Asset", entityId: assetId, metadata: { resourceKey, id: itemId } });
  res.json({ ok: true });
}

export async function setFeaturedImage(req: Request, res: Response) {
  const assetId = Number(req.params.assetId);
  await assertAssetExists(assetId);
  if (!req.file) throw new ApiError(400, "No file uploaded");

  const url = `/uploads/assets/featured/${req.file.filename}`;
  const asset = await prisma.asset.update({ where: { id: assetId }, data: { featuredImageUrl: url } });
  await logAudit({ userId: req.user!.id, action: "asset.featured_image.update", entityType: "Asset", entityId: assetId, metadata: { url } });
  res.status(201).json(asset);
}
