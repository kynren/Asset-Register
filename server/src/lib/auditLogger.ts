import { prisma } from "../config/prisma";

interface AuditEntry {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function logAudit(entry: AuditEntry) {
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
}
