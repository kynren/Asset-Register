import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import {
  getPermissionMap,
  issueAccessToken,
  issueRefreshToken,
  sanitizeUser,
  verifyCredentials,
  verifyRefreshToken,
} from "./auth.service";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const user = await verifyCredentials(email, password);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

  await logAudit({ userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipAddress: req.ip });

  const permissions = await getPermissionMap(user.roleId);
  res.json({ accessToken, user: sanitizeUser(user), permissions });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!token) throw new ApiError(401, "No refresh token");

  let payload: { id: number };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { role: true } });
  if (!user || !user.isActive) throw new ApiError(401, "Invalid refresh token");

  const accessToken = issueAccessToken(user);
  const permissions = await getPermissionMap(user.roleId);
  res.json({ accessToken, user: sanitizeUser(user), permissions });
}

export async function logout(req: Request, res: Response) {
  res.clearCookie(env.REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  if (req.user) {
    await logAudit({ userId: req.user.id, action: "auth.logout", ipAddress: req.ip });
  }
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  if (!user) throw new ApiError(404, "User not found");
  const permissions = await getPermissionMap(user.roleId);
  res.json({ user: sanitizeUser(user), permissions });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new ApiError(404, "User not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(400, "Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  await logAudit({ userId: user.id, action: "auth.change_password", entityType: "User", entityId: user.id });
  res.json({ ok: true });
}
