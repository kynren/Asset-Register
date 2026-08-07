-- Add canDuplicate to RolePermission, backfilled from canCreate so existing roles keep being able
-- to duplicate whatever they could already create until an admin explicitly changes it.
ALTER TABLE "RolePermission" ADD COLUMN "canDuplicate" BOOLEAN NOT NULL DEFAULT false;
UPDATE "RolePermission" SET "canDuplicate" = "canCreate";
