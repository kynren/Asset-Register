import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { sendEventEmail } from "../../lib/emailNotify";
import { resolveClientIp } from "../../lib/network";
import {
  createRefreshSession,
  generateMfaSecret,
  generateOpaqueToken,
  getMfaOtpAuthUrl,
  getPermissionMap,
  getSecuritySettings,
  hashToken,
  isPasswordReused,
  issueAccessToken,
  recordPasswordHistory,
  revokeAllOtherSessions,
  revokeRefreshSessionByToken,
  sanitizeUser,
  validatePasswordComplexity,
  validateRefreshSession,
  verifyCredentials,
  verifyMfaToken,
} from "./auth.service";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response) {
  const { email, password, mfaToken } = req.body;
  const user = await verifyCredentials(email, password);

  if (user.mfaEnabled) {
    if (!mfaToken) {
      res.json({ mfaRequired: true });
      return;
    }
    if (!user.mfaSecret || !(await verifyMfaToken(user.mfaSecret, mfaToken))) {
      throw new ApiError(401, "Invalid authentication code");
    }
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = issueAccessToken(user);
  const refreshToken = await createRefreshSession(user.id, req.headers["user-agent"] as string | undefined, (await resolveClientIp(req.ip)) ?? undefined);
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

  await logAudit({ userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipAddress: req.ip });

  const permissions = await getPermissionMap(user.roleId);
  res.json({ accessToken, user: sanitizeUser(user), permissions });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!token) throw new ApiError(401, "No refresh token");

  const session = await validateRefreshSession(token);
  if (!session) throw new ApiError(401, "Invalid or expired session");

  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { role: true } });
  if (!user || !user.isActive) throw new ApiError(401, "Invalid refresh token");

  const accessToken = issueAccessToken(user);
  const permissions = await getPermissionMap(user.roleId);
  res.json({ accessToken, user: sanitizeUser(user), permissions });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (token) await revokeRefreshSessionByToken(token);
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

  const settings = await getSecuritySettings();
  const complexityError = validatePasswordComplexity(newPassword, settings.passwordMinLength, settings.passwordRequireComplexity);
  if (complexityError) throw new ApiError(400, complexityError);

  if (await isPasswordReused(user.id, newPassword, settings.passwordHistoryCount)) {
    throw new ApiError(400, `New password must not match your last ${settings.passwordHistoryCount} password(s).`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
  });
  await recordPasswordHistory(user.id, passwordHash, settings.passwordHistoryCount);

  await logAudit({ userId: user.id, action: "auth.change_password", entityType: "User", entityId: user.id });
  res.json({ ok: true });
}

// ───────────────────────── Forgot / reset password ─────────────────────────

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Always respond the same way whether or not the account exists, to avoid leaking
  // which emails are registered.
  if (user && user.isActive) {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    const resetUrl = `${env.CLIENT_ORIGIN}/reset-password/${rawToken}`;
    await sendEventEmail({
      eventType: "PASSWORD_RESET",
      to: user.email,
      variables: { firstName: user.firstName, resetUrl },
      fallbackSubject: "Reset your Kynren Asset Register password",
      fallbackText: `Hello ${user.firstName},\n\nA password reset was requested for your account. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    });
    await logAudit({ userId: user.id, action: "auth.forgot_password_requested", entityType: "User", entityId: user.id, ipAddress: req.ip });
  }

  res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;
  const tokenHash = hashToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new ApiError(400, "This reset link is invalid or has expired.");
  }

  const settings = await getSecuritySettings();
  const complexityError = validatePasswordComplexity(newPassword, settings.passwordMinLength, settings.passwordRequireComplexity);
  if (complexityError) throw new ApiError(400, complexityError);

  if (await isPasswordReused(resetToken.userId, newPassword, settings.passwordHistoryCount)) {
    throw new ApiError(400, `New password must not match your last ${settings.passwordHistoryCount} password(s).`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: resetToken.userId },
    data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
  });
  await recordPasswordHistory(resetToken.userId, passwordHash, settings.passwordHistoryCount);
  await prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
  await prisma.refreshSession.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } });

  await logAudit({ userId: resetToken.userId, action: "auth.password_reset_completed", entityType: "User", entityId: resetToken.userId });
  res.json({ ok: true });
}

// ───────────────────────── MFA ─────────────────────────

export async function mfaEnrollStart(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new ApiError(404, "User not found");

  const secret = generateMfaSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret, mfaEnabled: false } });

  const otpAuthUrl = getMfaOtpAuthUrl(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);
  res.json({ secret, qrDataUrl });
}

export async function mfaEnrollVerify(req: Request, res: Response) {
  const { token } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.mfaSecret) throw new ApiError(400, "MFA enrollment has not been started");

  if (!(await verifyMfaToken(user.mfaSecret, token))) throw new ApiError(400, "Invalid authentication code");

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await logAudit({ userId: user.id, action: "auth.mfa_enabled", entityType: "User", entityId: user.id });
  res.json({ ok: true });
}

export async function mfaDisable(req: Request, res: Response) {
  await prisma.user.update({ where: { id: req.user!.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await logAudit({ userId: req.user!.id, action: "auth.mfa_disabled", entityType: "User", entityId: req.user!.id });
  res.json({ ok: true });
}

// ───────────────────────── Sessions ─────────────────────────

export async function listSessions(req: Request, res: Response) {
  const currentToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  const currentHash = currentToken ? hashToken(currentToken) : null;

  const sessions = await prisma.refreshSession.findMany({
    where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, tokenHash: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
  });

  res.json(
    sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.tokenHash === currentHash,
    }))
  );
}

export async function revokeSession(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = await prisma.refreshSession.findUnique({ where: { id } });
  if (!session || session.userId !== req.user!.id) throw new ApiError(404, "Session not found");

  await prisma.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: "auth.session_revoked", entityType: "RefreshSession", entityId: id });
  res.json({ ok: true });
}

export async function revokeOtherSessions(req: Request, res: Response) {
  const currentToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  const currentHash = currentToken ? hashToken(currentToken) : "";
  await revokeAllOtherSessions(req.user!.id, currentHash);
  await logAudit({ userId: req.user!.id, action: "auth.other_sessions_revoked", entityType: "User", entityId: req.user!.id });
  res.json({ ok: true });
}
