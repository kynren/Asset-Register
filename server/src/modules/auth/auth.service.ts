import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { generateSecret as generateOtpSecret, generateURI as generateOtpUri, verify as verifyOtp } from "otplib";
import { env } from "../../config/env";
import { currentSchemaName, prisma } from "../../config/prisma";
import { registerToken } from "../../config/controlPlane";
import { ApiError } from "../../middleware/errorHandler";

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseDurationToMs(input: string, fallbackMs: number): number {
  const match = input.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[match[2].toLowerCase()];
}

export const REFRESH_SESSION_TTL_MS = parseDurationToMs(env.REFRESH_JWT_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

// ───────────────────────── Credentials & lockout ─────────────────────────

export async function getSecuritySettings() {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          "passwordMinLength",
          "passwordRequireComplexity",
          "passwordMaxAgeDays",
          "passwordHistoryCount",
          "maxFailedLoginAttempts",
          "lockoutDurationMinutes",
        ],
      },
    },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    passwordMinLength: Number(map.passwordMinLength) || 8,
    passwordRequireComplexity: map.passwordRequireComplexity === "true",
    passwordMaxAgeDays: map.passwordMaxAgeDays ? Number(map.passwordMaxAgeDays) : null,
    passwordHistoryCount: map.passwordHistoryCount !== undefined ? Number(map.passwordHistoryCount) : 3,
    maxFailedLoginAttempts: Number(map.maxFailedLoginAttempts) || 5,
    lockoutDurationMinutes: Number(map.lockoutDurationMinutes) || 15,
  };
}

export function validatePasswordComplexity(password: string, minLength: number, requireComplexity: boolean): string | null {
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (requireComplexity) {
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one symbol.";
  }
  return null;
}

export async function isPasswordReused(userId: number, newPassword: string, historyCount: number): Promise<boolean> {
  if (historyCount <= 0) return false;
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: historyCount,
  });
  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.passwordHash)) return true;
  }
  return false;
}

export async function recordPasswordHistory(userId: number, passwordHash: string, keep: number) {
  await prisma.passwordHistory.create({ data: { userId, passwordHash } });
  if (keep > 0) {
    const stale = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: keep,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.passwordHistory.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  }
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw new ApiError(423, `Account locked due to too many failed login attempts. Try again in ${minutesLeft} minute(s).`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const settings = await getSecuritySettings();
    const attempts = user.failedLoginAttempts + 1;
    const data: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts };
    if (attempts >= settings.maxFailedLoginAttempts) {
      data.lockedUntil = new Date(Date.now() + settings.lockoutDurationMinutes * 60_000);
    }
    await prisma.user.update({ where: { id: user.id }, data });
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }

  return user;
}

// ───────────────────────── Tokens & sessions ─────────────────────────

export function issueAccessToken(user: { id: number; roleId: number; role: { name: string } }) {
  return jwt.sign(
    { id: user.id, roleId: user.roleId, roleName: user.role.name, schemaName: currentSchemaName() },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

export async function createRefreshSession(userId: number, userAgent?: string, ipAddress?: string): Promise<string> {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_SESSION_TTL_MS);
  await prisma.refreshSession.create({ data: { userId, tokenHash, userAgent, ipAddress, expiresAt } });
  // The refresh cookie is opaque (not a JWT), so /auth/refresh has no way to know which tenant
  // schema to look in until it can resolve this hash via the control plane first.
  await registerToken(tokenHash, currentSchemaName(), "refresh");
  return rawToken;
}

export async function validateRefreshSession(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  return session;
}

export async function revokeRefreshSessionByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllOtherSessions(userId: number, keepTokenHash: string) {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null, tokenHash: { not: keepTokenHash } },
    data: { revokedAt: new Date() },
  });
}

// ───────────────────────── MFA (TOTP) ─────────────────────────

export function generateMfaSecret(): string {
  return generateOtpSecret();
}

export function getMfaOtpAuthUrl(email: string, secret: string): string {
  return generateOtpUri({ issuer: "Kynren Asset Register", label: email, secret });
}

export async function verifyMfaToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verifyOtp({ secret, token });
    return result.valid;
  } catch {
    return false;
  }
}

// ───────────────────────── Permissions & shaping ─────────────────────────

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
  mfaEnabled: boolean;
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
    mfaEnabled: user.mfaEnabled,
  };
}
