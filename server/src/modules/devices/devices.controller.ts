import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { subnetOf } from "../../lib/network";

export async function ingest(req: Request, res: Response) {
  const data = req.body;

  const device = await prisma.device.upsert({
    where: { macAddress: data.macAddress },
    update: { ...data, lastSeen: new Date() },
    create: { ...data, lastSeen: new Date() },
  });

  const subnet = subnetOf(data.ipAddresses?.[0]);
  await prisma.networkNode.upsert({
    where: { deviceId: device.id },
    update: { label: device.hostname, ipAddress: data.ipAddresses?.[0], subnet },
    create: { type: "DEVICE", label: device.hostname, ipAddress: data.ipAddresses?.[0], subnet, deviceId: device.id },
  });

  res.status(201).json({ ok: true, deviceId: device.id });
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const search = req.query.search as string | undefined;
  const unregisteredOnly = req.query.unregistered === "true";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [{ hostname: { contains: search, mode: "insensitive" as const } }, { macAddress: { contains: search, mode: "insensitive" as const } }];
  }
  if (unregisteredOnly) {
    where.asset = null;
  }

  const [items, total] = await Promise.all([
    prisma.device.findMany({ where, include: { asset: true }, skip, take, orderBy: { lastSeen: "desc" } }),
    prisma.device.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
}

export async function getOne(req: Request, res: Response) {
  const device = await prisma.device.findUnique({ where: { id: Number(req.params.id) }, include: { asset: true } });
  if (!device) throw new ApiError(404, "Device not found");
  res.json(device);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.device.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "device.delete", entityType: "Device", entityId: id });
  res.json({ ok: true });
}
