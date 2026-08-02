import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { DEFAULT_SCHEMA, currentSchemaName, prisma, runWithTenant } from "../../config/prisma";
import { getOrganizationById, registerToken, resolveAccountSchema, resolveTokenSchema } from "../../config/controlPlane";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { sendEventEmail } from "../../lib/emailNotify";
import { resolveClientIp } from "../../lib/network";
import {
  createRefreshSession,
  generateMfaSecret,
  generateOpaqueToken,
  getEffectivePermissionMap,
  getMfaOtpAuthUrl,
  getSecuritySettings,
  getViewingOrganization,
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

// System Admin's own identity only ever lives in `public` — while it's "viewing" another
// organization (schemaName in the JWT points at that org, not home), every self-referential
// lookup below (profile, password, MFA, sessions) has to bypass the ambient tenant and go
// straight to `public`, or it'd either 404 or — worse — resolve to an unrelated real person who
// happens to share the same numeric id in that org's own User table.
function homeSchemaFor(req: Request): string {
  return req.user?.roleName === "System Admin" ? DEFAULT_SCHEMA : currentSchemaName();
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response) {
  const { email, password, mfaToken } = req.body;
  const schemaName = await resolveAccountSchema(email);
  if (!schemaName) throw new ApiError(401, "Invalid email or password");

  await runWithTenant(schemaName, async () => {
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

    const permissions = await getEffectivePermissionMap(user.roleId, user.role.name);
    const organization = await getViewingOrganization(schemaName);
    res.json({ accessToken, user: sanitizeUser(user), permissions, organization });
  });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!token) throw new ApiError(401, "No refresh token");

  // The refresh cookie is an opaque token, not a JWT — it carries no tenant claim of its own, so
  // the control plane has to tell us which schema to even look for the session in.
  const tokenHash = hashToken(token);
  const schemaName = await resolveTokenSchema(tokenHash);
  if (!schemaName) throw new ApiError(401, "Invalid or expired session");

  await runWithTenant(schemaName, async () => {
    const session = await validateRefreshSession(token);
    if (!session) throw new ApiError(401, "Invalid or expired session");

    const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { role: true } });
    if (!user || !user.isActive) throw new ApiError(401, "Invalid refresh token");

    // Only System Admin can ever be "viewing" a schema other than its own home (enforced at
    // switch-time in appSettings.controller.ts) — so a viewingOrganizationId hint from any other
    // role is simply ignored, same as a hint naming an organization that doesn't exist. This is
    // what makes a switch survive the ~15 min access-token lifetime indefinitely (see
    // client/src/api/viewingOrgStore.ts): every refresh re-applies the same "still viewing X"
    // choice instead of quietly falling back to home the moment the old token expires.
    let targetSchemaName = schemaName;
    const viewingOrganizationId = Number(req.body?.viewingOrganizationId);
    if (user.role.name === "System Admin" && Number.isFinite(viewingOrganizationId)) {
      const target = await getOrganizationById(viewingOrganizationId);
      if (target) targetSchemaName = target.schemaName;
    }

    const accessToken = issueAccessToken(user, targetSchemaName);
    const permissions = await getEffectivePermissionMap(user.roleId, user.role.name);
    const organization = await getViewingOrganization(targetSchemaName);
    res.json({ accessToken, user: sanitizeUser(user), permissions, organization });
  });
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
  const organization = await getViewingOrganization(currentSchemaName());
  await runWithTenant(homeSchemaFor(req), async () => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { role: true } });
    if (!user) throw new ApiError(404, "User not found");
    const permissions = await getEffectivePermissionMap(user.roleId, user.role.name);
    res.json({ user: sanitizeUser(user), permissions, organization });
  });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  await runWithTenant(homeSchemaFor(req), async () => {
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
  });
}

// ───────────────────────── Forgot / reset password ─────────────────────────

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const schemaName = await resolveAccountSchema(email);

  // Always respond the same way whether or not the account exists, to avoid leaking which
  // emails are registered — so a miss on the control-plane index just skips straight to that
  // generic response instead of erroring.
  if (schemaName) {
    await runWithTenant(schemaName, async () => {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (user && user.isActive) {
        const rawToken = generateOpaqueToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
        await registerToken(tokenHash, schemaName, "reset");

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
    });
  }

  res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;
  const tokenHash = hashToken(token);
  const schemaName = await resolveTokenSchema(tokenHash);
  if (!schemaName) throw new ApiError(400, "This reset link is invalid or has expired.");

  await runWithTenant(schemaName, async () => {
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
  });
}

// ───────────────────────── Magic login link ─────────────────────────
// Admin-initiated (see users.controller.ts sendMagicLink) rather than self-service like forgot
// password — an admin generates and emails a one-time link from a user's Detail page, and
// consuming it here logs that user straight in via the same access-token + refresh-session path
// as a normal password login. Kept short-lived (15 min) since it grants a live session, not just
// access to a reset form.

export async function magicLogin(req: Request, res: Response) {
  const { token } = req.body;
  const tokenHash = hashToken(token);
  const schemaName = await resolveTokenSchema(tokenHash);
  if (!schemaName) throw new ApiError(400, "This login link is invalid or has expired.");

  await runWithTenant(schemaName, async () => {
    const magicToken = await prisma.magicLoginToken.findUnique({ where: { tokenHash } });

    if (!magicToken || magicToken.usedAt || magicToken.expiresAt < new Date()) {
      throw new ApiError(400, "This login link is invalid or has expired.");
    }

    const user = await prisma.user.findUnique({ where: { id: magicToken.userId }, include: { role: true } });
    if (!user || !user.isActive) throw new ApiError(400, "This login link is invalid or has expired.");

    await prisma.magicLoginToken.update({ where: { id: magicToken.id }, data: { usedAt: new Date() } });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = issueAccessToken(user);
    const refreshToken = await createRefreshSession(user.id, req.headers["user-agent"] as string | undefined, (await resolveClientIp(req.ip)) ?? undefined);
    res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    await logAudit({ userId: user.id, action: "auth.magic_login", entityType: "User", entityId: user.id, ipAddress: req.ip });

    const permissions = await getEffectivePermissionMap(user.roleId, user.role.name);
    const organization = await getViewingOrganization(schemaName);
    res.json({ accessToken, user: sanitizeUser(user), permissions, organization });
  });
}

// ───────────────────────── MFA ─────────────────────────

export async function mfaEnrollStart(req: Request, res: Response) {
  await runWithTenant(homeSchemaFor(req), async () => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new ApiError(404, "User not found");

    const secret = generateMfaSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret, mfaEnabled: false } });

    const otpAuthUrl = getMfaOtpAuthUrl(user.email, secret);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);
    res.json({ secret, qrDataUrl });
  });
}

export async function mfaEnrollVerify(req: Request, res: Response) {
  const { token } = req.body;
  await runWithTenant(homeSchemaFor(req), async () => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.mfaSecret) throw new ApiError(400, "MFA enrollment has not been started");

    if (!(await verifyMfaToken(user.mfaSecret, token))) throw new ApiError(400, "Invalid authentication code");

    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await logAudit({ userId: user.id, action: "auth.mfa_enabled", entityType: "User", entityId: user.id });
    res.json({ ok: true });
  });
}

export async function mfaDisable(req: Request, res: Response) {
  await runWithTenant(homeSchemaFor(req), async () => {
    await prisma.user.update({ where: { id: req.user!.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await logAudit({ userId: req.user!.id, action: "auth.mfa_disabled", entityType: "User", entityId: req.user!.id });
    res.json({ ok: true });
  });
}

// ───────────────────────── Sessions ─────────────────────────

export async function listSessions(req: Request, res: Response) {
  const currentToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  const currentHash = currentToken ? hashToken(currentToken) : null;

  await runWithTenant(homeSchemaFor(req), async () => {
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
  });
}

export async function revokeSession(req: Request, res: Response) {
  const id = Number(req.params.id);
  await runWithTenant(homeSchemaFor(req), async () => {
    const session = await prisma.refreshSession.findUnique({ where: { id } });
    if (!session || session.userId !== req.user!.id) throw new ApiError(404, "Session not found");

    await prisma.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit({ userId: req.user!.id, action: "auth.session_revoked", entityType: "RefreshSession", entityId: id });
    res.json({ ok: true });
  });
}

export async function revokeOtherSessions(req: Request, res: Response) {
  const currentToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  const currentHash = currentToken ? hashToken(currentToken) : "";
  await runWithTenant(homeSchemaFor(req), async () => {
    await revokeAllOtherSessions(req.user!.id, currentHash);
    await logAudit({ userId: req.user!.id, action: "auth.other_sessions_revoked", entityType: "User", entityId: req.user!.id });
    res.json({ ok: true });
  });
}
