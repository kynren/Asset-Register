import { prisma } from "../config/prisma";
import { MODULES } from "../constants/modules";

const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
export const SYSTEM_ADMIN_EMAIL = "subscriptions@kynren.com";

// System Admin (platform-level: creates organizations, owns App Settings) was introduced after
// this app's original install was already seeded with "Super Admin" as its top role — same
// situation as backfillHarnessPermission.ts, and deliberately following the same conservative
// pattern: only ever CREATE the role if it's missing (never touch an existing role's permissions,
// in case an admin has since customized them), scoped to `public` only since System Admin is
// reserved for Kynren's own platform operators, not every tenant. Runs once at boot, unwrapped by
// runWithTenant so it falls back to the `public` schema by design.
export async function backfillSystemAdmin(): Promise<void> {
  let role = await prisma.role.findUnique({ where: { name: SYSTEM_ADMIN_ROLE_NAME } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: SYSTEM_ADMIN_ROLE_NAME,
        description: "Platform-level access: creates organizations, and owns App Settings (Backups, System Settings, System Status) — the only role that can grant itself to another user.",
        isSystem: true,
      },
    });
    await prisma.rolePermission.createMany({
      data: MODULES.map((module) => ({ roleId: role!.id, module, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true })),
    });
  }

  const user = await prisma.user.findUnique({ where: { email: SYSTEM_ADMIN_EMAIL } });
  if (user && user.roleId !== role.id) {
    await prisma.user.update({ where: { id: user.id }, data: { roleId: role.id } });
  }
}
