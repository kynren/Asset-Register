import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";

interface Person {
  id: number;
  personId: string;
  name: string;
  organization: { id: number; name: string } | null;
}
interface Door {
  id: number;
  name: string;
  doorNumber: number;
  device: { id: number; name: string };
}
interface AccessGroup {
  id: number;
  name: string;
  planTemplateNo: string;
  lastAppliedAt: string | null;
  createdAt: string;
  members: { id: number; personId: number; person: Person }[];
  doors: { id: number; doorId: number; door: Door }[];
}

export function AccessGroupTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccessGroup | null>(null);
  const [deleting, setDeleting] = useState<AccessGroup | null>(null);
  const [personFilter, setPersonFilter] = useState("");
  const [doorFilter, setDoorFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: groups, isLoading } = useQuery({
    queryKey: ["access-groups"],
    queryFn: async () => (await axiosClient.get("/access-control/groups")).data as AccessGroup[],
  });
  const { data: allPersons } = useQuery({ queryKey: ["access-control-persons", null, ""], queryFn: async () => (await axiosClient.get("/access-control/persons")).data as Person[] });
  const { data: devices } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as { id: number; name: string; doors: { id: number; name: string; doorNumber: number }[] }[],
  });
  const allDoors: Door[] = (devices ?? []).flatMap((d) => d.doors.map((door) => ({ ...door, device: { id: d.id, name: d.name } })));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["access-groups"] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/groups/${id}`),
    onSuccess: () => { invalidate(); setDeleting(null); if (selectedId === deleting?.id) setSelectedId(null); },
  });

  const applyMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/groups/${id}/apply`),
    onSuccess: invalidate,
  });

  const selected = groups?.find((g) => g.id === selectedId) ?? null;

  const columns: ColumnDef<AccessGroup, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "Schedule Template", accessorFn: (g) => `Template ${g.planTemplateNo}` },
    { header: "Number of Persons", accessorFn: (g) => g.members.length },
    { header: "Access Control Points", accessorFn: (g) => g.doors.length },
    {
      header: "Status",
      cell: ({ row }) => {
        const g = row.original;
        if (!g.lastAppliedAt) return <span className="badge badge-neutral">Not applied</span>;
        return <span className="badge badge-success" title={`Applied ${dayjs(g.lastAppliedAt).format("DD MMM YYYY, HH:mm")}`}>All applied</span>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <PermissionGate module="access-control" action="edit">
          <button className="btn btn-secondary btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); setEditing(row.original); }} title="Edit">
            <Icon name="edit" size={12} />
          </button>
        </PermissionGate>
      ),
    },
  ];

  const filteredPersons = (selected?.members ?? []).filter((m) => m.person.name.toLowerCase().includes(personFilter.toLowerCase()) || m.person.personId.includes(personFilter));
  const filteredDoors = (selected?.doors ?? []).filter((d) => d.door.name.toLowerCase().includes(doorFilter.toLowerCase()));

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div className="row gap-2">
            <PermissionGate module="access-control" action="create">
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Icon name="plus" size={13} /> Add</button>
            </PermissionGate>
            <PermissionGate module="access-control" action="delete">
              <button className="btn btn-secondary btn-sm" disabled={!selected} onClick={() => selected && setDeleting(selected)}><Icon name="trash" size={13} /> Delete</button>
            </PermissionGate>
            <PermissionGate module="access-control" action="edit">
              <button className="btn btn-secondary btn-sm" disabled={!selected || applyMutation.isPending} onClick={() => selected && applyMutation.mutate(selected.id)}>
                <Icon name="link" size={13} /> {applyMutation.isPending ? "Applying..." : "Apply to Device"}
              </button>
            </PermissionGate>
          </div>
        </div>

        {applyMutation.data && (
          <div className={`alert ${applyMutation.data.data.ok ? "alert-success" : "alert-danger"}`} style={{ marginBottom: 10 }}>{applyMutation.data.data.message}</div>
        )}

        {isLoading && <Skeleton height={160} />}
        {!isLoading && (
          <DataTable
            columns={columns}
            data={groups ?? []}
            clientPageSize={10}
            onRowClick={(g) => setSelectedId(g.id)}
            emptyMessage='No access groups yet — click "Add" to bundle persons, doors, and a schedule into one grantable group.'
          />
        )}
      </div>

      {selected && (
        <div className="row gap-3" style={{ alignItems: "flex-start" }}>
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Person ({selected.members.length})</strong>
              <input className="input" placeholder="Filter" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} style={{ width: 140 }} />
            </div>
            {filteredPersons.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0", textAlign: "center" }}><span className="muted" style={{ fontSize: 12 }}>No Data</span></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Name</th><th>Person ID</th><th>Organization</th></tr></thead>
                <tbody>
                  {filteredPersons.map((m) => (
                    <tr key={m.id}><td>{m.person.name}</td><td>{m.person.personId}</td><td>{m.person.organization?.name ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Access Point ({selected.doors.length})</strong>
              <input className="input" placeholder="Filter" value={doorFilter} onChange={(e) => setDoorFilter(e.target.value)} style={{ width: 140 }} />
            </div>
            {filteredDoors.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0", textAlign: "center" }}><span className="muted" style={{ fontSize: 12 }}>No Data</span></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Access Point</th><th>Group Name</th></tr></thead>
                <tbody>
                  {filteredDoors.map((d) => (
                    <tr key={d.id}><td>{d.door.device.name} — {d.door.name}</td><td>{selected.name}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {(showForm || editing) && (
        <AccessGroupFormModal
          group={editing}
          allPersons={allPersons ?? []}
          allDoors={allDoors}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={invalidate}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete access group"
          message={`Delete "${deleting.name}"? This removes the grouping only — it does not revoke access already provisioned on the controllers. This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function AccessGroupFormModal({
  group,
  allPersons,
  allDoors,
  onClose,
  onSaved,
}: {
  group: AccessGroup | null;
  allPersons: Person[];
  allDoors: Door[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [planTemplateNo, setPlanTemplateNo] = useState(group?.planTemplateNo ?? "1");
  const [personIds, setPersonIds] = useState<Set<number>>(new Set(group?.members.map((m) => m.personId) ?? []));
  const [doorIds, setDoorIds] = useState<Set<number>>(new Set(group?.doors.map((d) => d.doorId) ?? []));

  function toggle(set: Set<number>, setSet: (s: Set<number>) => void, id: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name, planTemplateNo, personIds: [...personIds], doorIds: [...doorIds] };
      return group ? axiosClient.patch(`/access-control/groups/${group.id}`, body) : axiosClient.post("/access-control/groups", body);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <FormModal title={group ? "Edit Access Group" : "Add Access Group"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()} maxWidth={640}>
      <div className="grid grid-cols-2">
        <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Schedule Template</label><input className="input" value={planTemplateNo} onChange={(e) => setPlanTemplateNo(e.target.value)} placeholder="e.g. 1 = All-day" /></div>
      </div>

      <div className="grid grid-cols-2">
        <div className="field">
          <label>Persons ({personIds.size} selected)</label>
          <div className="stack gap-1" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
            {allPersons.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No persons in the directory yet.</p>}
            {allPersons.map((p) => (
              <label key={p.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={personIds.has(p.id)} onChange={() => toggle(personIds, setPersonIds, p.id)} />
                {p.name} <span className="muted">({p.personId})</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Access Points ({doorIds.size} selected)</label>
          <div className="stack gap-1" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
            {allDoors.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No doors added yet.</p>}
            {allDoors.map((d) => (
              <label key={d.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={doorIds.has(d.id)} onChange={() => toggle(doorIds, setDoorIds, d.id)} />
                {d.device.name} — {d.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Saving only updates this group locally. Use "Apply to Device" on the Access Group list to push it to each door's controller.</p>
    </FormModal>
  );
}
