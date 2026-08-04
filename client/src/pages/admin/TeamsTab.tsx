import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";

interface TeamMemberRow {
  id: number;
  userId: number;
  user: { id: number; firstName: string; lastName: string };
}
interface Team {
  id: number;
  name: string;
  members: TeamMemberRow[];
}
interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}

export function TeamsTab() {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const queryClient = useQueryClient();

  const { data: teams, isLoading } = useQuery({ queryKey: ["teams"], queryFn: async () => (await axiosClient.get("/teams")).data as Team[] });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });
  const selectedTeam = teams?.find((t) => t.id === selectedTeamId) ?? teams?.[0];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/teams/${id}`),
    meta: { successMessage: "Team deleted" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teams"] }); setDeletingTeam(null); setSelectedTeamId(null); },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["teams"] });
  }

  const teamColumns: ColumnDef<Team, any>[] = [
    { header: "Name", accessorKey: "name", meta: { cardTitle: true } },
    { header: "Members", accessorFn: (t) => t.members.length },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={(e) => { e.stopPropagation(); setEditingTeam(row.original); }}>
              <Icon name="edit" size={13} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={(e) => { e.stopPropagation(); setDeletingTeam(row.original); }}>
              <Icon name="trash" size={13} />
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  const memberColumns: ColumnDef<TeamMemberRow, any>[] = [
    { header: "Member", accessorFn: (m) => `${m.user.firstName} ${m.user.lastName}`, meta: { cardTitle: true } },
  ];

  if (isLoading || !teams) return <p className="muted">Loading teams...</p>;

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <h3 className="mt-0 mb-0">Teams</h3>
            <p className="muted" style={{ margin: "2px 0 0" }}>Assignable as a group on Helpdesk tickets. Click a team to view its members below.</p>
          </div>
          <PermissionGate module="admin" action="create">
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Team</button>
          </PermissionGate>
        </div>
        <DataTable
          tableId="admin.teams"
          exportModule="admin"
          importUrl="/teams/import"
          onImported={() => queryClient.invalidateQueries({ queryKey: ["teams"] })}
          columns={teamColumns}
          data={teams}
          clientPageSize={10}
          emptyMessage="No teams yet."
          onRowClick={(t) => setSelectedTeamId(t.id)}
        />
      </div>

      {selectedTeam && (
        <div className="card">
          <h3 className="mt-0">{selectedTeam.name} — Members</h3>
          <DataTable
            tableId="admin.team-members"
            exportModule="admin"
            columns={memberColumns}
            data={selectedTeam.members}
            clientPageSize={10}
            emptyMessage="No members yet — edit this team to add some."
          />
        </div>
      )}

      {(showCreate || editingTeam) && (
        <TeamFormModal
          team={editingTeam}
          allUsers={users ?? []}
          onClose={() => { setShowCreate(false); setEditingTeam(null); }}
          onSaved={() => { invalidate(); setShowCreate(false); setEditingTeam(null); }}
        />
      )}

      {deletingTeam && (
        <ConfirmDialog
          title="Delete team"
          message={`Delete "${deletingTeam.name}"? Tickets currently assigned to this team will keep their history but show no team once it's gone. This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeletingTeam(null)}
          onConfirm={() => deleteMutation.mutate(deletingTeam.id)}
        />
      )}
    </div>
  );
}

function TeamFormModal({ team, allUsers, onClose, onSaved }: { team: Team | null; allUsers: DirectoryUser[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team?.name ?? "");
  const [userIds, setUserIds] = useState<Set<number>>(new Set(team?.members.map((m) => m.userId) ?? []));

  function toggle(id: number) {
    const next = new Set(userIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setUserIds(next);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name, userIds: [...userIds] };
      return team ? axiosClient.patch(`/teams/${team.id}`, body) : axiosClient.post("/teams", body);
    },
    onSuccess: () => onSaved(),
  });

  return (
    <FormModal title={team ? "Edit Team" : "New Team"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()} maxWidth={480}>
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save this team."}</div>}

      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>

      <div className="field">
        <label>Members ({userIds.size} selected)</label>
        <div className="stack gap-1" style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
          {allUsers.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No users found.</p>}
          {allUsers.map((u) => (
            <label key={u.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={userIds.has(u.id)} onChange={() => toggle(u.id)} />
              {u.firstName} {u.lastName}
            </label>
          ))}
        </div>
      </div>
    </FormModal>
  );
}
