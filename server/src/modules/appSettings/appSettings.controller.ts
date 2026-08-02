import { Request, Response } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { listOrganizations, resolveAccountSchema } from "../../config/controlPlane";
import { provisionOrganization } from "../../lib/tenantProvisioning";
import { logAudit } from "../../lib/auditLogger";

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
