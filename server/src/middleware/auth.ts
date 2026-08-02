import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { DEFAULT_SCHEMA, runWithTenant } from "../config/prisma";

export interface AccessTokenPayload {
  id: number;
  roleId: number;
  roleName: string;
  schemaName?: string;
}

export function verifyJwt(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    req.user = { id: payload.id, roleId: payload.roleId, roleName: payload.roleName };
    // Tokens issued before multi-tenancy existed have no schemaName claim — treat them as the
    // original `public`-schema organization rather than rejecting them.
    runWithTenant(payload.schemaName ?? DEFAULT_SCHEMA, () => next());
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
