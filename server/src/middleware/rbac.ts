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

export function requirePermission(module: ModuleName, action: ActionName) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    if (!(await hasPermission(req.user.roleId, module, action))) {
      return res.status(403).json({ error: `Not permitted to ${action} ${module}` });
    }

    next();
  };
}
