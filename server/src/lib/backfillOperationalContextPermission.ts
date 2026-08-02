import { prisma } from "../config/prisma";

// Operational Context split off from the "assets" RBAC module into its own "operational-context"
// module so it can be granted independently in Roles & Permissions. Every existing role only has
// an "assets" RolePermission row, so without this, everyone who could already see Operational
// Context would be locked out the moment this deploys (a brand-new module defaults to all-false
// until an admin happens to open Roles & Permissions and save). This runs once at boot and is
// idempotent — it only creates an "operational-context" row for a role that doesn't have one yet,
// seeded from that role's current "assets" permissions so existing access is preserved; anything
// an admin subsequently changes takes over normally. Mirrors backfillHarnessPermission.ts exactly.
export async function backfillOperationalContextPermission(): Promise<void> {
  const roles = await prisma.role.findMany({
    include: { permissions: { where: { module: { in: ["assets", "operational-context"] } } } },
  });

  for (const role of roles) {
    if (role.permissions.some((p) => p.module === "operational-context")) continue;
    const assetsPerm = role.permissions.find((p) => p.module === "assets");
    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        module: "operational-context",
        canView: assetsPerm?.canView ?? false,
        canCreate: assetsPerm?.canCreate ?? false,
        canEdit: assetsPerm?.canEdit ?? false,
        canDelete: assetsPerm?.canDelete ?? false,
        canExport: assetsPerm?.canExport ?? false,
      },
    });
  }
}
