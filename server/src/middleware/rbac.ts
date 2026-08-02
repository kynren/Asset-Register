import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ActionName, ModuleName } from "../constants/modules";

const actionColumn: Record<ActionName, "canView" | "canCreate" | "canEdit" | "canDelete" | "canExport"> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
  export: "canExport",
};

export async function hasPermission(roleId: number, module: ModuleName, action: ActionName): Promise<boolean> {
  const permission = await prisma.rolePermission.findUnique({
    where: { roleId_module: { roleId, module } },
  });
  return Boolean(permission?.[actionColumn[action]]);
}

const SYSTEM_ADMIN_ROLE_NAME = "System Admin";

export function requirePermission(module: ModuleName, action: ActionName) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    // System Admin always has full access, in every organization's schema — including ones it's
    // just "viewing" (see appSettings.controller.ts switchOrganization), where its roleId doesn't
    // correspond to anything meaningful in that org's own Role table. Checked by name straight off
    // the JWT payload so this never needs a query.
    if (req.user.roleName === SYSTEM_ADMIN_ROLE_NAME) return next();

    if (!(await hasPermission(req.user.roleId, module, action))) {
      return res.status(403).json({ error: `Not permitted to ${action} ${module}` });
    }

    next();
  };
}

// Harness Register items are ordinary Asset rows (just filed under the "Harness" category) that
// share the generic /assets create/read/update/delete routes rather than having their own CRUD
// endpoints. Gating those shared routes on the "harness" module for Harness records — and falling
// back to "assets" for every other category — lets an admin grant Harness Register access
// separately from general Asset Inventory access without duplicating the whole assets API surface.
// For creates, the category is read from the request body (the asset doesn't exist yet); for
// existing items, it's read from the row itself so the check works regardless of what the caller
// tries to change categoryId to.
export function requireAssetOrHarnessPermission(action: ActionName) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.roleName === SYSTEM_ADMIN_ROLE_NAME) return next();

    let categoryId: number | undefined;
    if (req.params.id) {
      const asset = await prisma.asset.findUnique({ where: { id: Number(req.params.id) }, select: { categoryId: true } });
      categoryId = asset?.categoryId ?? undefined;
    } else if (req.body?.categoryId) {
      categoryId = Number(req.body.categoryId);
    } else if (req.query?.categoryId) {
      // The Harness Register list view scopes the generic GET /assets list route with
      // ?categoryId=<harness category id> rather than hitting a dedicated endpoint.
      categoryId = Number(req.query.categoryId);
    }

    let module: ModuleName = "assets";
    if (categoryId !== undefined) {
      const category = await prisma.assetCategory.findUnique({ where: { id: categoryId }, select: { name: true } });
      if (category?.name === "Harness") module = "harness";
    }

    if (!(await hasPermission(req.user.roleId, module, action))) {
      return res.status(403).json({ error: `Not permitted to ${action} ${module}` });
    }

    next();
  };
}
