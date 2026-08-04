import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";

interface Sla {
  id: number;
  name: string;
  ttoMinutes: number | null;
  ttrMinutes: number;
}

export function TicketSlasTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [ttoMinutes, setTtoMinutes] = useState("");
  const [ttrMinutes, setTtrMinutes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Sla | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["ticket-slas"], queryFn: async () => (await axiosClient.get("/ticket-slas")).data as Sla[] });

  function resetForm() {
    setName("");
    setTtoMinutes("");
    setTtrMinutes("");
    setEditingId(null);
  }

  function payload() {
    return { name, ttoMinutes: ttoMinutes ? Number(ttoMinutes) : null, ttrMinutes: Number(ttrMinutes) };
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/ticket-slas", payload()),
    meta: { successMessage: "SLA created" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-slas"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/ticket-slas/${editingId}`, payload()),
    meta: { successMessage: "SLA updated" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-slas"] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/ticket-slas/${id}`),
    meta: { successMessage: "SLA deleted" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-slas"] }); setDeleting(null); },
  });

  function startEdit(s: Sla) {
    setEditingId(s.id);
    setName(s.name);
    setTtoMinutes(s.ttoMinutes != null ? String(s.ttoMinutes) : "");
    setTtrMinutes(String(s.ttrMinutes));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ttrMinutes) return;
    if (editingId != null) updateMutation.mutate();
    else createMutation.mutate();
  }

  function formatMinutes(m: number | null) {
    if (m == null) return "—";
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h ? `${h}h ${rem}m` : `${rem}m`;
  }

  const columns: ColumnDef<Sla, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "Time to Own (TTO)", accessorFn: (r) => formatMinutes(r.ttoMinutes) },
    { header: "Time to Resolve (TTR)", accessorFn: (r) => formatMinutes(r.ttrMinutes) },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => startEdit(row.original)}><Icon name="edit" size={13} /></button>
          </PermissionGate>
          <PermissionGate module="admin" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}><Icon name="trash" size={13} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <h3 className="mt-0">Service Level Agreements</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        TTO/TTR are calendar-time offsets from ticket creation — not business-hours aware. Assign an SLA to a Ticket Category as its default, or set one directly on a ticket.
      </p>
      <PermissionGate module="admin" action={editingId != null ? "edit" : "create"}>
        <form className="row gap-2 flex-wrap" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} />
          <input className="input" type="number" min={0} placeholder="TTO minutes (optional)" value={ttoMinutes} onChange={(e) => setTtoMinutes(e.target.value)} style={{ maxWidth: 200 }} />
          <input className="input" type="number" min={1} placeholder="TTR minutes" value={ttrMinutes} onChange={(e) => setTtrMinutes(e.target.value)} style={{ maxWidth: 160 }} />
          <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {editingId != null ? "Save" : "Add SLA"}
          </button>
          {editingId != null && <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>}
        </form>
      </PermissionGate>
      <DataTable tableId="admin.ticket-slas" exportModule="admin" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={10} emptyMessage="No SLAs defined yet." />
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message="Tickets currently using this SLA will keep their existing due dates but the SLA link will be removed. Continue?"
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
