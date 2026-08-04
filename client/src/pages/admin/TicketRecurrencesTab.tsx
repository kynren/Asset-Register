import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";

interface Recurrence {
  id: number;
  name: string;
  templateId: number;
  template: { id: number; name: string };
  periodicityDays: number;
  createBeforeDays: number;
  nextCreationAt: string;
  endDate: string | null;
  isActive: boolean;
  lastCreatedTicket: { id: number; ticketNumber: string } | null;
}

interface Template { id: number; name: string }

function emptyForm() {
  return { name: "", templateId: "", periodicityDays: "7", createBeforeDays: "0", nextCreationAt: dayjs().format("YYYY-MM-DDTHH:mm"), endDate: "" };
}

export function TicketRecurrencesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Recurrence | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["ticket-recurrences"], queryFn: async () => (await axiosClient.get("/ticket-recurrences")).data as Recurrence[] });
  const { data: templates } = useQuery({ queryKey: ["ticket-templates"], queryFn: async () => (await axiosClient.get("/ticket-templates")).data as Template[] });

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  function payload() {
    return {
      name: form.name,
      templateId: Number(form.templateId),
      periodicityDays: Number(form.periodicityDays),
      createBeforeDays: Number(form.createBeforeDays) || 0,
      nextCreationAt: new Date(form.nextCreationAt).toISOString(),
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/ticket-recurrences", payload()),
    meta: { successMessage: "Recurrence created" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-recurrences"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/ticket-recurrences/${editingId}`, payload()),
    meta: { successMessage: "Recurrence updated" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-recurrences"] }); resetForm(); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => axiosClient.patch(`/ticket-recurrences/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-recurrences"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/ticket-recurrences/${id}`),
    meta: { successMessage: "Recurrence deleted" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-recurrences"] }); setDeleting(null); },
  });

  function startEdit(r: Recurrence) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      templateId: String(r.templateId),
      periodicityDays: String(r.periodicityDays),
      createBeforeDays: String(r.createBeforeDays),
      nextCreationAt: dayjs(r.nextCreationAt).format("YYYY-MM-DDTHH:mm"),
      endDate: r.endDate ? dayjs(r.endDate).format("YYYY-MM-DDTHH:mm") : "",
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.templateId || !form.periodicityDays) return;
    if (editingId != null) updateMutation.mutate();
    else createMutation.mutate();
  }

  const columns: ColumnDef<Recurrence, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "Template", accessorFn: (r) => r.template.name },
    { header: "Every", accessorFn: (r) => `${r.periodicityDays} day${r.periodicityDays === 1 ? "" : "s"}` },
    { header: "Next Creation", accessorFn: (r) => dayjs(r.nextCreationAt).format("DD MMM YYYY, HH:mm") },
    { header: "Last Ticket", accessorFn: (r) => r.lastCreatedTicket?.ticketNumber ?? "—" },
    {
      header: "Active",
      cell: ({ row }) => (
        <PermissionGate module="admin" action="edit" fallback={row.original.isActive ? "Yes" : "No"}>
          <button className={`btn btn-sm ${row.original.isActive ? "btn-primary" : "btn-secondary"}`} onClick={() => toggleActiveMutation.mutate({ id: row.original.id, isActive: !row.original.isActive })}>
            {row.original.isActive ? "Active" : "Paused"}
          </button>
        </PermissionGate>
      ),
    },
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
      <h3 className="mt-0">Recurring Tickets</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        A new ticket is stamped out from the template every N days, up to <code>createBeforeDays</code> ahead of the actual due occurrence.
      </p>
      <PermissionGate module="admin" action={editingId != null ? "edit" : "create"}>
        <form className="stack gap-2" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <div className="row gap-2 flex-wrap">
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ maxWidth: 220 }} />
            <select className="input" style={{ maxWidth: 200 }} value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
              <option value="">Select template...</option>
              {templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className="input" type="number" min={1} placeholder="Every N days" value={form.periodicityDays} onChange={(e) => setForm((f) => ({ ...f, periodicityDays: e.target.value }))} style={{ maxWidth: 140 }} />
            <input className="input" type="number" min={0} placeholder="Create N days before" value={form.createBeforeDays} onChange={(e) => setForm((f) => ({ ...f, createBeforeDays: e.target.value }))} style={{ maxWidth: 160 }} />
          </div>
          <div className="row gap-2 flex-wrap">
            <div className="field">
              <label style={{ fontSize: 12 }}>Next creation</label>
              <input className="input" type="datetime-local" value={form.nextCreationAt} onChange={(e) => setForm((f) => ({ ...f, nextCreationAt: e.target.value }))} />
            </div>
            <div className="field">
              <label style={{ fontSize: 12 }}>End date (optional)</label>
              <input className="input" type="datetime-local" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending || updateMutation.isPending} style={{ alignSelf: "flex-end" }}>
              {editingId != null ? "Save" : "Add Recurrence"}
            </button>
            {editingId != null && <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-end" }} onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </PermissionGate>
      <DataTable tableId="admin.ticket-recurrences" exportModule="admin" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={10} emptyMessage="No recurring tickets configured." />
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message="This recurrence rule will stop creating new tickets. Continue?"
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
