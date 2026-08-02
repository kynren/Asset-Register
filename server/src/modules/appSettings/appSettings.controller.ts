import { Request, Response } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { getOrganizationById, listOrganizations, renameOrganizationSchema, resolveAccountSchema, updateOrganizationName } from "../../config/controlPlane";
import { provisionOrganization } from "../../lib/tenantProvisioning";
import { logAudit } from "../../lib/auditLogger";
import { getEffectivePermissionMap, issueAccessToken } from "../auth/auth.service";

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
export async function switchOrganization(req: Request, res: Response) {
  if (req.user!.roleName !== "System Admin") throw new ApiError(403, "Only a System Admin can switch organizations.");

  const id = Number(req.params.id);
  const target = await getOrganizationById(id);
  if (!target) throw new ApiError(404, "Organization not found");

  const accessToken = issueAccessToken({ id: req.user!.id, roleId: req.user!.roleId, role: { name: req.user!.roleName } }, target.schemaName);
  const permissions = await getEffectivePermissionMap(req.user!.roleId, req.user!.roleName);

  await logAudit({ userId: req.user!.id, action: "appSettings.organization_switch", entityType: "Organization", entityId: target.id, metadata: { schemaName: target.schemaName } });

  res.json({ accessToken, organization: target, permissions });
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
