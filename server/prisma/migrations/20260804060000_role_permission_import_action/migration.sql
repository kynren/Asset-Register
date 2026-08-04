-- RolePermission: new "Import" action alongside view/create/edit/delete/export.
-- Backfilled from canCreate so existing roles keep today's behavior (import buttons were
-- previously gated on "create") until an admin explicitly changes it in Roles & Permissions.
ALTER TABLE "RolePermission" ADD COLUMN "canImport" BOOLEAN NOT NULL DEFAULT false;
UPDATE "RolePermission" SET "canImport" = "canCreate";
