import { prisma } from "../config/prisma";

interface AuditEntry {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

// Best-effort: a System Admin acting while "viewing" another organization (see
// appSettings.controller.ts switchOrganization) has a userId that only exists in its own home
// schema, not the org it's currently viewing — writing that id here would violate AuditLog's FK
// to User in the active tenant. Audit logging failing should never take the underlying action
// down with it, so this swallows the error (logging it) rather than throwing.
export async function logAudit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as never,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error("[logAudit] failed to write audit entry:", err);
  }
}
