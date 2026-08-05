import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "./Icon";
import { FormModal } from "./FormModal";
import { ChipSelect } from "./ChipSelect";

export type AccessLevel = "EDIT" | "DELETE";
export type AccessTargetKind = "user" | "team";

export interface AccessGrant {
  userId: number | null;
  teamId: number | null;
  level: AccessLevel;
  user: { id: number; firstName: string; lastName: string } | null;
  team: { id: number; name: string } | null;
}

interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}

interface DirectoryTeam {
  id: number;
  name: string;
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
export function canManageRecordAccess(createdById: number, userId: number, roleName: string) {
  return createdById === userId || BYPASS_ROLE_NAMES.includes(roleName);
}

function grantLabel(a: { userId: number | null; teamId: number | null; user: { firstName: string; lastName: string } | null; team: { name: string } | null }) {
  if (a.teamId != null) return a.team ? `${a.team.name} (team)` : `Team #${a.teamId}`;
  return a.user ? `${a.user.firstName} ${a.user.lastName}` : `User #${a.userId}`;
}

// Shared by AccessGrantPicker and ManageAccessModal — a "Person"/"Team" toggle next to the picker
// itself, since the two target types come from different directories and are mutually exclusive
// per grant (see RecordAccessGrant's userId/teamId columns in schema.prisma).
function TargetPicker({
  kind,
  onKindChange,
  users,
  teams,
  pickedId,
  onPickedIdChange,
}: {
  kind: AccessTargetKind;
  onKindChange: (kind: AccessTargetKind) => void;
  users: DirectoryUser[];
  teams: DirectoryTeam[];
  pickedId: string;
  onPickedIdChange: (id: string) => void;
}) {
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <ChipSelect
        style={{ width: "auto", minWidth: 110 }}
        value={kind}
        onChange={(v) => { onKindChange(v as AccessTargetKind); onPickedIdChange(""); }}
        options={[
          { value: "user", label: "Person" },
          { value: "team", label: "Team" },
        ]}
      />
      <div style={{ flex: 1 }}>
        {kind === "user" ? (
          <ChipSelect value={pickedId} onChange={onPickedIdChange} placeholder="Select a person..." options={users.map((u) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))} />
        ) : (
          <ChipSelect value={pickedId} onChange={onPickedIdChange} placeholder="Select a team..." options={teams.map((t) => ({ value: String(t.id), label: t.name }))} />
        )}
      </div>
    </div>
  );
}

// Creation-time picker: lets the creator queue up grants (to a person or a team) before the record
// exists, submitted alongside the create payload as `access`. Fully controlled — the parent owns
// the list.
export function AccessGrantPicker({
  users,
  teams,
  value,
  onChange,
}: {
  users: DirectoryUser[];
  teams: DirectoryTeam[];
  value: { userId?: string; teamId?: string; level: AccessLevel }[];
  onChange: (next: { userId?: string; teamId?: string; level: AccessLevel }[]) => void;
}) {
  const [kind, setKind] = useState<AccessTargetKind>("user");
  const [pickedId, setPickedId] = useState("");
  const [pickedLevel, setPickedLevel] = useState<AccessLevel>("EDIT");

  const grantableUsers = users.filter((u) => !value.some((a) => a.userId === String(u.id)));
  const grantableTeams = teams.filter((t) => !value.some((a) => a.teamId === String(t.id)));

  return (
    <div className="field">
      <label>Give other users or teams access (optional)</label>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 2, marginBottom: 8 }}>
        You'll always have full access as the creator. Grant edit and/or delete access to specific people or whole
        teams now, or later from "Manage Access". A team grant applies to everyone currently on that team.
      </p>
      {value.length > 0 && (
        <div className="stack gap-1" style={{ marginBottom: 8 }}>
          {value.map((a) => {
            const label = a.teamId
              ? teams.find((t) => String(t.id) === a.teamId)?.name ?? a.teamId
              : (() => { const u = users.find((usr) => String(usr.id) === a.userId); return u ? `${u.firstName} ${u.lastName}` : a.userId; })();
            return (
              <div key={`${a.userId ?? a.teamId}-${a.level}`} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                <span>{label}{a.teamId ? " (team)" : ""} — <span className="muted">{a.level === "EDIT" ? "Can edit" : "Can delete"}</span></span>
                <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => onChange(value.filter((x) => x !== a))}>
                  <Icon name="close" size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="row gap-2" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <TargetPicker kind={kind} onKindChange={setKind} users={grantableUsers} teams={grantableTeams} pickedId={pickedId} onPickedIdChange={setPickedId} />
        </div>
        <select className="select" style={{ width: 110 }} value={pickedLevel} onChange={(e) => setPickedLevel(e.target.value as AccessLevel)}>
          <option value="EDIT">Can edit</option>
          <option value="DELETE">Can delete</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!pickedId}
          onClick={() => {
            onChange([...value, kind === "user" ? { userId: pickedId, level: pickedLevel } : { teamId: pickedId, level: pickedLevel }]);
            setPickedId("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// Post-creation access management — grant/revoke against a live `POST/DELETE {apiBasePath}/access`
// pair (see server/src/lib/recordAccess.ts and any of the *.routes.ts files that mount it).
export function ManageAccessModal({
  title,
  apiBasePath,
  access,
  createdById,
  users,
  teams,
  queryKey,
  onClose,
}: {
  title: string;
  apiBasePath: string;
  access: AccessGrant[];
  createdById: number;
  users: DirectoryUser[];
  teams: DirectoryTeam[];
  queryKey: unknown[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AccessTargetKind>("user");
  const [pickedId, setPickedId] = useState("");
  const [pickedLevel, setPickedLevel] = useState<AccessLevel>("EDIT");

  const addMutation = useMutation({
    mutationFn: (params: { userId?: number; teamId?: number; level: AccessLevel }) => axiosClient.post(`${apiBasePath}/access`, params),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); setPickedId(""); },
  });
  const removeMutation = useMutation({
    mutationFn: (params: { kind: AccessTargetKind; targetId: number; level: AccessLevel }) =>
      axiosClient.delete(`${apiBasePath}/access/${params.kind}/${params.targetId}/${params.level}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const grantableUsers = users.filter((u) => u.id !== createdById);

  return (
    <FormModal title={`Manage Access — ${title}`} onClose={onClose} hideFooter>
      <p className="muted" style={{ fontSize: 12 }}>
        Only people and teams granted access here (plus you, the creator) can edit or delete this. A team grant
        applies to everyone currently on that team.
      </p>
      <div className="stack gap-2" style={{ marginBottom: 14 }}>
        {access.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No one else has access yet.</div>}
        {access.map((a) => (
          <div key={`${a.userId ?? a.teamId}-${a.level}`} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontSize: 13 }}>
              {grantLabel(a)} <span className="muted" style={{ fontSize: 11.5 }}>({a.level === "EDIT" ? "Can edit" : "Can delete"})</span>
            </span>
            <button
              className="btn btn-danger btn-sm btn-icon"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate({ kind: a.teamId != null ? "team" : "user", targetId: (a.teamId ?? a.userId)!, level: a.level })}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="row gap-2" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Grant access to</label>
          <TargetPicker kind={kind} onKindChange={setKind} users={grantableUsers} teams={teams} pickedId={pickedId} onPickedIdChange={setPickedId} />
        </div>
        <select className="select" style={{ width: 110 }} value={pickedLevel} onChange={(e) => setPickedLevel(e.target.value as AccessLevel)}>
          <option value="EDIT">Can edit</option>
          <option value="DELETE">Can delete</option>
        </select>
        <button
          className="btn btn-primary"
          disabled={!pickedId || addMutation.isPending}
          onClick={() => addMutation.mutate(kind === "user" ? { userId: Number(pickedId), level: pickedLevel } : { teamId: Number(pickedId), level: pickedLevel })}
        >
          Grant
        </button>
      </div>
    </FormModal>
  );
}
