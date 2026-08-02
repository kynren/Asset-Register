import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { MODULES } from "../../constants/modules";

// Pads a role's `permissions` with an all-false row for any module in MODULES that has
// no RolePermission row yet — e.g. right after a new module is added to the constant,
// before every existing role has been re-saved or reseeded. Without this, the API would
// silently omit newly-added modules from a role's permission list.
function padPermissions<T extends { permissions: { module: string }[] }>(role: T): T {
  const have = new Set(role.permissions.map((p) => p.module));
  const missing = MODULES.filter((m) => !have.has(m)).map((module) => ({
    module,
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canExport: false,
  }));
  return { ...role, permissions: [...role.permissions, ...missing] };
}

export async function list(_req: Request, res: Response) {
  const roles = await prisma.role.findMany({
    include: { permissions: true, _count: { select: { users: true } } },
    orderBy: { id: "asc" },
  });
  res.json(roles.map(padPermissions));
}

export async function getOne(req: Request, res: Response) {
  const role = await prisma.role.findUnique({
    where: { id: Number(req.params.id) },
    include: { permissions: true },
  });
  if (!role) throw new ApiError(404, "Role not found");
  res.json(padPermissions(role));
}

export async function create(req: Request, res: Response) {
  const { name, description } = req.body;
  const role = await prisma.role.create({
    data: {
      name,
      description,
      permissions: { create: MODULES.map((module) => ({ module, canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false })) },
    },
    include: { permissions: true },
  });
  await logAudit({ userId: req.user!.id, action: "role.create", entityType: "Role", entityId: role.id });
  res.status(201).json(role);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Role not found");
  if (existing.isSystem) throw new ApiError(400, "Cannot rename a system role");

  const role = await prisma.role.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "role.update", entityType: "Role", entityId: id, metadata: req.body });
  res.json(role);
}

export async function updatePermissions(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { permissions } = req.body;

  const existing = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  if (!existing) throw new ApiError(404, "Role not found");
  if (existing.name === "System Admin") throw new ApiError(400, "System Admin always has full access and cannot be edited.");

  await prisma.$transaction(
    permissions.map((p: { module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean }) =>
      prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: id, module: p.module } },
        update: p,
        create: { roleId: id, ...p },
      })
    )
  );

  await logAudit({ userId: req.user!.id, action: "role.update_permissions", entityType: "Role", entityId: id });
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) throw new ApiError(404, "Role not found");
  res.json(padPermissions(role));
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw new ApiError(404, "Role not found");
  if (role.isSystem) throw new ApiError(400, "Cannot delete a system role");
  if (role._count.users > 0) throw new ApiError(400, "Cannot delete a role with assigned users");

  await prisma.role.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "role.delete", entityType: "Role", entityId: id });
  res.json({ ok: true });
}
