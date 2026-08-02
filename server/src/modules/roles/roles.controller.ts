import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { MODULES } from "../../constants/modules";

const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
const APP_SETTINGS_MODULE = "app-settings";

function isSystemAdminName(name: string): boolean {
  return name.trim().toLowerCase() === SYSTEM_ADMIN_ROLE_NAME.toLowerCase();
}

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

// System Admin is a platform-level role (see backfillSystemAdmin.ts / seedRoles.ts) — a non-System-
// Admin viewer shouldn't even see that it exists, let alone open its (locked, always-full-access)
// permission matrix. Real enforcement is elsewhere (rbac.ts's by-name bypass, updatePermissions'
// own guard below); this is just keeping it out of a view that isn't System Admin's business.
function visibleTo<T extends { name: string }>(roles: T[], req: Request): T[] {
  if (req.user!.roleName === SYSTEM_ADMIN_ROLE_NAME) return roles;
  return roles.filter((r) => !isSystemAdminName(r.name));
}

export async function list(req: Request, res: Response) {
  const roles = await prisma.role.findMany({
    include: { permissions: true, _count: { select: { users: true } } },
    orderBy: { id: "asc" },
  });
  res.json(visibleTo(roles, req).map(padPermissions));
}

export async function getOne(req: Request, res: Response) {
  const role = await prisma.role.findUnique({
    where: { id: Number(req.params.id) },
    include: { permissions: true },
  });
  if (!role || visibleTo([role], req).length === 0) throw new ApiError(404, "Role not found");
  res.json(padPermissions(role));
}

export async function create(req: Request, res: Response) {
  const { name, description } = req.body;
  if (typeof name === "string" && isSystemAdminName(name)) {
    throw new ApiError(400, `"${SYSTEM_ADMIN_ROLE_NAME}" is reserved and cannot be used for another role.`);
  }
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
  if (typeof req.body?.name === "string" && isSystemAdminName(req.body.name)) {
    throw new ApiError(400, `"${SYSTEM_ADMIN_ROLE_NAME}" is reserved and cannot be used for another role.`);
  }

  const role = await prisma.role.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "role.update", entityType: "Role", entityId: id, metadata: req.body });
  res.json(role);
}

export type RolePermissionInput = { module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean };

// Shared by the direct-save route below AND the App Settings "Change Management" scheduler/publish
// path (see modules/scheduledChanges) — a scheduled permission change re-runs this exact function
// at apply time, not just at schedule-creation time, so both guards below are re-validated against
// the role's CURRENT state even if it was valid when the change was originally scheduled (e.g. the
// role could have been renamed to "System Admin" or deleted in the meantime).
export async function applyRolePermissions(roleId: number, permissions: RolePermissionInput[], userId: number) {
  const existing = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
  if (!existing) throw new ApiError(404, "Role not found");
  if (isSystemAdminName(existing.name)) throw new ApiError(400, "System Admin always has full access and cannot be edited.");

  // App Settings (organizations, backups, system settings/status — see appSettings module) is
  // deliberately System Admin-only at the platform level; no other role, however it's edited, is
  // allowed to be granted any part of it. The UI already hides this module's row for every role
  // except System Admin (see client RolesTab.tsx), but that's just presentation — this is the
  // actual enforcement, so a direct API call can't grant it either.
  const grantsAppSettings = permissions.some(
    (p) => p.module === APP_SETTINGS_MODULE && (p.canView || p.canCreate || p.canEdit || p.canDelete || p.canExport)
  );
  if (grantsAppSettings) throw new ApiError(400, "App Settings can only be granted to the System Admin role.");

  await prisma.$transaction(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: { roleId_module: { roleId, module: p.module } },
        update: p,
        create: { roleId, ...p },
      })
    )
  );

  await logAudit({ userId, action: "role.update_permissions", entityType: "Role", entityId: roleId });
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
  if (!role) throw new ApiError(404, "Role not found");
  return padPermissions(role);
}

export async function updatePermissions(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { permissions } = req.body;
  res.json(await applyRolePermissions(id, permissions, req.user!.id));
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
