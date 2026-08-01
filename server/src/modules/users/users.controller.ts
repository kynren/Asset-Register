import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { sendEventEmail } from "../../lib/emailNotify";
import { generateTempPassword } from "../../lib/passwords";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { generateOpaqueToken, hashToken } from "../auth/auth.service";

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true } },
};

export async function directory(_req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { firstName: "asc" },
  });
  res.json(users);
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const search = (req.query.search as string) || undefined;

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.user.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
}

export async function getOne(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: Number(req.params.id) }, select: userSelect });
  if (!user) throw new ApiError(404, "User not found");
  res.json(user);
}

export async function devices(req: Request, res: Response) {
  const userId = Number(req.params.id);
  const assets = await prisma.asset.findMany({
    where: { assignedToId: userId },
    include: { device: true, category: true, location: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(assets);
}

export async function create(req: Request, res: Response) {
  const { email, firstName, lastName, roleId, password } = req.body;
  const tempPassword = password || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), firstName, lastName, roleId, passwordHash, mustChangePassword: true },
    select: userSelect,
  });

  await logAudit({ userId: req.user!.id, action: "user.create", entityType: "User", entityId: user.id });
  await sendEventEmail({
    eventType: "ACCOUNT_CREATED",
    to: user.email,
    variables: { firstName: user.firstName, lastName: user.lastName, email: user.email, tempPassword, loginUrl: `${env.CLIENT_ORIGIN}/login` },
    fallbackSubject: "Your Kynren Asset Register account",
    fallbackText: `Hello ${user.firstName},\n\nAn account was created for you on the Kynren Asset Register.\n\nEmail: ${user.email}\nTemporary password: ${tempPassword}\n\nYou'll be asked to set a new password on first login: ${env.CLIENT_ORIGIN}/login`,
  });
  res.status(201).json({ user, tempPassword });
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (id === req.user!.id && req.body.isActive === false) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }
  const { email, ...rest } = req.body;
  // Lowercased to match verifyCredentials()/create()'s lookup convention — otherwise a
  // mixed-case edit here would silently break that user's next login.
  const data = email !== undefined ? { ...rest, email: email.toLowerCase() } : rest;
  const user = await prisma.user.update({ where: { id }, data, select: userSelect });
  await logAudit({ userId: req.user!.id, action: "user.update", entityType: "User", entityId: id, metadata: req.body });
  res.json(user);
}

export async function resetPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const newPassword = req.body.newPassword || generateTempPassword();
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
  await logAudit({ userId: req.user!.id, action: "user.reset_password", entityType: "User", entityId: id });
  res.json({ ok: true, tempPassword: newPassword });
}

// Short-lived (15 min) since, unlike a password reset link, clicking it logs the recipient
// straight into a live session — no separate re-authentication step.
export async function sendMagicLink(req: Request, res: Response) {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "User not found");
  if (!user.isActive) throw new ApiError(400, "Cannot send a login link to a deactivated account");

  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.magicLoginToken.create({ data: { userId: user.id, tokenHash, expiresAt, createdById: req.user!.id } });

  const magicUrl = `${env.CLIENT_ORIGIN}/magic-login/${rawToken}`;
  await sendEventEmail({
    eventType: "MAGIC_LOGIN_LINK",
    to: user.email,
    variables: { firstName: user.firstName, magicUrl },
    fallbackSubject: "Your Kynren Asset Register login link",
    fallbackText: `Hello ${user.firstName},\n\nAn administrator generated a one-time login link for your account. This link signs you straight in and expires in 15 minutes:\n\n${magicUrl}\n\nIf you weren't expecting this, you can ignore this email.`,
  });
  await logAudit({ userId: req.user!.id, action: "user.magic_link_sent", entityType: "User", entityId: id });
  res.json({ ok: true });
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (id === req.user!.id) throw new ApiError(400, "You cannot delete your own account");
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await logAudit({ userId: req.user!.id, action: "user.deactivate", entityType: "User", entityId: id });
  res.json({ ok: true });
}
