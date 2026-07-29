import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    throw new ApiError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "Invalid email or password");
  }

  return user;
}

export function issueAccessToken(user: { id: number; roleId: number; role: { name: string } }) {
  return jwt.sign(
    { id: user.id, roleId: user.roleId, roleName: user.role.name },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

export function issueRefreshToken(user: { id: number }) {
  return jwt.sign({ id: user.id }, env.REFRESH_JWT_SECRET, {
    expiresIn: env.REFRESH_JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): { id: number } {
  return jwt.verify(token, env.REFRESH_JWT_SECRET) as { id: number };
}

export async function getPermissionMap(roleId: number) {
  const permissions = await prisma.rolePermission.findMany({ where: { roleId } });
  const map: Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean }> = {};
  for (const p of permissions) {
    map[p.module] = {
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canExport: p.canExport,
    };
  }
  return map;
}

export function sanitizeUser(user: {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  roleId: number;
  role: { id: number; name: string };
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    accentColor: user.accentColor,
    roleId: user.roleId,
    roleName: user.role.name,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
  };
}
