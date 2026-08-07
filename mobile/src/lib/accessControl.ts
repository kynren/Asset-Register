// Mirrors client/src/components/AccessControl.tsx's grant model + helper functions, used by every
// module built on the generic RecordAccessGrant system (Docs & SOPs, Knowledge Base, IT Projects,
// Reports). Pure logic — no UI — shared across mobile screens that need to gate edit/delete/manage
// actions against a record's creator + explicit grants.
export type AccessLevel = "EDIT" | "DELETE" | "VIEW" | "DUPLICATE";
export type AccessTargetKind = "user" | "team";

export interface AccessGrant {
  userId: number | null;
  teamId: number | null;
  level: AccessLevel;
  user: { id: number; firstName: string; lastName: string } | null;
  team: { id: number; name: string } | null;
}

const BYPASS_ROLE_NAMES = ["System Admin", "Super Admin"];

export function hasAccessGrant(access: AccessGrant[], userId: number, myTeamIds: number[], level: AccessLevel) {
  return access.some((a) => a.level === level && (a.userId === userId || (a.teamId != null && myTeamIds.includes(a.teamId))));
}
export function canEditRecord(createdById: number, access: AccessGrant[], userId: number, roleName: string, myTeamIds: number[]) {
  return createdById === userId || hasAccessGrant(access, userId, myTeamIds, "EDIT") || BYPASS_ROLE_NAMES.includes(roleName);
}
export function canDeleteRecord(createdById: number, access: AccessGrant[], userId: number, roleName: string, myTeamIds: number[]) {
  return createdById === userId || hasAccessGrant(access, userId, myTeamIds, "DELETE") || BYPASS_ROLE_NAMES.includes(roleName);
}
export function canDuplicateRecord(createdById: number, access: AccessGrant[], userId: number, roleName: string, myTeamIds: number[]) {
  return createdById === userId || hasAccessGrant(access, userId, myTeamIds, "DUPLICATE") || BYPASS_ROLE_NAMES.includes(roleName);
}
export function canManageRecordAccess(createdById: number, userId: number, roleName: string) {
  return createdById === userId || BYPASS_ROLE_NAMES.includes(roleName);
}

export function grantLabel(a: { userId: number | null; teamId: number | null; user: { firstName: string; lastName: string } | null; team: { name: string } | null }) {
  if (a.teamId != null) return a.team ? `${a.team.name} (team)` : `Team #${a.teamId}`;
  return a.user ? `${a.user.firstName} ${a.user.lastName}` : `User #${a.userId}`;
}

export const LEVEL_LABELS: Record<AccessLevel, string> = { EDIT: "Can edit", DELETE: "Can delete", VIEW: "Can view", DUPLICATE: "Can duplicate" };
