import { prisma } from "../config/prisma";

// Harness Register split off from the "assets" RBAC module into its own "harness" module so it
// can be granted independently in Roles & Permissions. Every existing role only has an "assets"
// RolePermission row, so without this, everyone who could already use Harness Register would be
// locked out the moment this deploys (a brand-new module defaults to all-false until an admin
// happens to open Roles & Permissions and save). This runs once at boot and is idempotent — it
// only creates a "harness" row for a role that doesn't have one yet, seeded from that role's
// current "assets" permissions so existing access is preserved; anything an admin subsequently
// changes takes over normally.
export async function backfillHarnessPermission(): Promise<void> {
  const roles = await prisma.role.findMany({
    include: { permissions: { where: { module: { in: ["assets", "harness"] } } } },
  });

  for (const role of roles) {
    if (role.permissions.some((p) => p.module === "harness")) continue;
    const assetsPerm = role.permissions.find((p) => p.module === "assets");
    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        module: "harness",
        canView: assetsPerm?.canView ?? false,
        canCreate: assetsPerm?.canCreate ?? false,
        canEdit: assetsPerm?.canEdit ?? false,
        canDelete: assetsPerm?.canDelete ?? false,
        canExport: assetsPerm?.canExport ?? false,
      },
    });
  }
}
