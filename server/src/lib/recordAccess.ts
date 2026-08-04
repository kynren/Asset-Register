import { RecordAccessLevel } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/errorHandler";

// "user created entries should always be editable [by] the creator and super or system admin or
// users they give edit access to" — both admin roles get a blanket bypass here, not just System
// Admin's usual codebase-wide bypass (see rbac.ts). Super Admin is an ordinary seeded per-org role
// otherwise, so this is the one place it's treated specially, on purpose, per that instruction.
export const RECORD_ACCESS_BYPASS_ROLE_NAMES = ["System Admin", "Super Admin"];
const BYPASS_ROLE_NAMES = RECORD_ACCESS_BYPASS_ROLE_NAMES;

interface OwnedRecord {
  createdById: number;
}

// A grant target is either a single user or an entire team — exactly one of the two, same
// convention as ReportShare's sharedWithUserId/sharedWithTeamId.
export type RecordAccessTarget = { userId: number } | { teamId: number };

// App-wide creator/editor/delete-access check: the record's own creator, System/Super Admin,
// anyone explicitly granted `level` access directly, or anyone who's a member of a team granted
// `level` access. `entityType` is a plain string tag (e.g. "ProjectCard", "Document") rather than
// a typed relation — see the RecordAccessGrant model comment in schema.prisma for why.
export async function hasRecordAccess(
  entityType: string,
  entityId: number,
  record: OwnedRecord,
  userId: number,
  roleName: string,
  level: RecordAccessLevel
): Promise<boolean> {
  if (BYPASS_ROLE_NAMES.includes(roleName)) return true;
  if (record.createdById === userId) return true;
  const grant = await prisma.recordAccessGrant.findFirst({
    where: {
      entityType,
      entityId,
      level,
      OR: [{ userId }, { team: { members: { some: { userId } } } }],
    },
  });
  return grant !== null;
}

export async function requireRecordAccess(
  entityType: string,
  entityId: number,
  record: OwnedRecord,
  userId: number,
  roleName: string,
  level: RecordAccessLevel,
  message: string
): Promise<void> {
  const allowed = await hasRecordAccess(entityType, entityId, record, userId, roleName, level);
  if (!allowed) throw new ApiError(403, message);
}

export interface RecordAccessGrantRow {
  userId: number | null;
  teamId: number | null;
  level: RecordAccessLevel;
  user: { id: number; firstName: string; lastName: string } | null;
  team: { id: number; name: string } | null;
}

const grantRowSelect = {
  userId: true,
  teamId: true,
  level: true,
  user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
} as const;

export async function listRecordAccess(entityType: string, entityId: number): Promise<RecordAccessGrantRow[]> {
  return prisma.recordAccessGrant.findMany({ where: { entityType, entityId }, select: grantRowSelect });
}

// Batch variant for list endpoints — one query instead of N, grouped by entityId.
export async function listRecordAccessBatch(entityType: string, entityIds: number[]): Promise<Map<number, RecordAccessGrantRow[]>> {
  const rows = await prisma.recordAccessGrant.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { entityId: true, ...grantRowSelect },
  });
  const map = new Map<number, RecordAccessGrantRow[]>();
  for (const row of rows) {
    const { entityId, ...rest } = row;
    const list = map.get(entityId) ?? [];
    list.push(rest);
    map.set(entityId, list);
  }
  return map;
}

// Only the record's creator (or System/Super Admin) may grant/revoke access on it — enforced by
// the caller checking `record.createdById`/roleName before calling these, same as every other
// creator-only action in this codebase (see e.g. projects.routes.ts's editor grant routes).
// findFirst+create instead of an upsert-by-compound-key: with userId/teamId both nullable now,
// a single upsert can't target "the right" unique constraint depending on which one is set.
export async function grantRecordAccess(entityType: string, entityId: number, target: RecordAccessTarget, level: RecordAccessLevel, grantedById: number) {
  const where = "userId" in target
    ? { entityType, entityId, userId: target.userId, teamId: null, level }
    : { entityType, entityId, teamId: target.teamId, userId: null, level };
  const existing = await prisma.recordAccessGrant.findFirst({ where });
  if (existing) return existing;
  return prisma.recordAccessGrant.create({
    data: { entityType, entityId, level, grantedById, ...("userId" in target ? { userId: target.userId } : { teamId: target.teamId }) },
  });
}

export async function revokeRecordAccess(entityType: string, entityId: number, target: RecordAccessTarget, level: RecordAccessLevel) {
  const where = "userId" in target
    ? { entityType, entityId, userId: target.userId, level }
    : { entityType, entityId, teamId: target.teamId, level };
  await prisma.recordAccessGrant.deleteMany({ where });
}
