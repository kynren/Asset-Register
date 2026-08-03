import { Request, Response } from "express";
import { env } from "../../config/env";
import { DEFAULT_SCHEMA, prisma, runWithTenant } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { getOrganizationById, listOrganizations, renameOrganizationSchema, resolveAccountSchema, updateOrganizationLogo, updateOrganizationName } from "../../config/controlPlane";
import { provisionOrganization } from "../../lib/tenantProvisioning";
import { logAudit } from "../../lib/auditLogger";
import { getEffectivePermissionMap, hashToken, issueAccessToken, verifyUserCredential } from "../auth/auth.service";

export async function listOrgs(_req: Request, res: Response) {
  res.json(await listOrganizations());
}

// Authenticated, System-Admin-only organization creation — replaces what used to be a public
// self-serve /signup flow. Deliberately does NOT log the caller into the new organization (that
// would silently swap out the System Admin's own session); the new org's first user logs in
// separately with the credentials set here, capped at Super Admin for their own org (see
// tenantProvisioning.ts — System Admin itself is never granted to a new org's first user).
export async function createOrg(req: Request, res: Response) {
  const { organizationName, firstName, lastName, email, password } = req.body;

  const existingSchema = await resolveAccountSchema(email);
  if (existingSchema) throw new ApiError(409, "An account with this email already exists.");

  const { organizationId, schemaName } = await provisionOrganization({ organizationName, firstName, lastName, email, password });

  await logAudit({
    userId: req.user!.id,
    action: "appSettings.organization_create",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { organizationName, schemaName, adminEmail: email },
  });

  res.status(201).json({ id: organizationId, name: organizationName, schemaName });
}

// Lets a System Admin browse the app as any organization without a second login — issues a fresh
// access token whose `schemaName` claim points at the target org while `id`/`roleId`/`roleName`
// stay the System Admin's own. Every route it touches from here on is authorized by the by-name
// System Admin bypass in middleware/rbac.ts (its roleId has no meaning outside its home schema),
// and any self-referential lookup (profile, password, MFA — see auth.controller.ts) resolves
// against `public` regardless, so identity never gets confused with a real user of the org being
// viewed. The refresh cookie/session is untouched, so the natural ~15 min access-token expiry
// quietly reverts the view back to `public` — switch again to resume.
//
// Requires re-verifying the caller's own password/PIN before switching (same shared lockout as
// login — see verifyUserCredential) and records how long the client can skip re-confirming this
// same org on the caller's refresh session (`orgSwitchConfirmedOrgId`/`Until`) — this is purely a
// UI convenience flag for OrgSwitchConfirmModal, not a new authorization boundary: actual data
// access is still governed entirely by the access token's `schemaName` claim, unchanged.
export async function switchOrganization(req: Request, res: Response) {
  if (req.user!.roleName !== "System Admin") throw new ApiError(403, "Only a System Admin can switch organizations.");

  const id = Number(req.params.id);
  const target = await getOrganizationById(id);
  if (!target) throw new ApiError(404, "Organization not found");

  const { password, pin, rememberMinutes } = req.body as { password?: string; pin?: string; rememberMinutes: number | null };
  const credential = pin ? { pin } : { password: password! };

  const refreshCookieToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!refreshCookieToken) throw new ApiError(401, "No active session");
  const tokenHash = hashToken(refreshCookieToken);

  const orgSwitchConfirmedUntil = await runWithTenant(DEFAULT_SCHEMA, async () => {
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== req.user!.id) {
      throw new ApiError(401, "Invalid or expired session");
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new ApiError(404, "User not found");

    await verifyUserCredential(user, credential);

    const until = rememberMinutes == null ? null : new Date(Math.min(Date.now() + rememberMinutes * 60_000, session.expiresAt.getTime()));
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { orgSwitchConfirmedOrgId: target.id, orgSwitchConfirmedUntil: until },
    });
    return until;
  });

  const accessToken = issueAccessToken({ id: req.user!.id, roleId: req.user!.roleId, role: { name: req.user!.roleName } }, target.schemaName);
  const permissions = await getEffectivePermissionMap(req.user!.roleId, req.user!.roleName);

  await logAudit({ userId: req.user!.id, action: "appSettings.organization_switch", entityType: "Organization", entityId: target.id, metadata: { schemaName: target.schemaName } });

  res.json({ accessToken, organization: target, permissions, orgSwitchConfirmedOrgId: target.id, orgSwitchConfirmedUntil });
}

export async function updateOrg(req: Request, res: Response) {
  const id = Number(req.params.id);
  const target = await getOrganizationById(id);
  if (!target) throw new ApiError(404, "Organization not found");

  const { name, schemaName } = req.body as { name?: string; schemaName?: string };

  if (name && name !== target.name) {
    await updateOrganizationName(id, name);
  }

  if (schemaName && schemaName !== target.schemaName) {
    try {
      await renameOrganizationSchema(id, schemaName);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Could not rename this organization's schema.");
    }
  }

  await logAudit({ userId: req.user!.id, action: "appSettings.organization_update", entityType: "Organization", entityId: id, metadata: { name, schemaName } });

  const updated = await getOrganizationById(id);
  res.json(updated);
}

export async function uploadOrgLogo(req: Request, res: Response) {
  const id = Number(req.params.id);
  const target = await getOrganizationById(id);
  if (!target) throw new ApiError(404, "Organization not found");
  if (!req.file) throw new ApiError(400, "Missing file");

  const url = `/uploads/org-logos/${req.file.filename}`;
  await updateOrganizationLogo(id, url);

  await logAudit({ userId: req.user!.id, action: "appSettings.organization_logo_update", entityType: "Organization", entityId: id, metadata: { url } });

  const updated = await getOrganizationById(id);
  res.json(updated);
}
