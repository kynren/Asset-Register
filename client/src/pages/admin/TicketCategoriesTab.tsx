import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";

interface Category {
  id: number;
  name: string;
  parentId: number | null;
  parent: { id: number; name: string } | null;
  defaultTemplateId: number | null;
  defaultTemplate: { id: number; name: string } | null;
  defaultSlaId: number | null;
  defaultSla: { id: number; name: string } | null;
}
interface Template { id: number; name: string }
interface Sla { id: number; name: string }

function emptyForm() {
  return { name: "", parentId: "", defaultTemplateId: "", defaultSlaId: "" };
}

export function TicketCategoriesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["ticket-categories"], queryFn: async () => (await axiosClient.get("/ticket-categories")).data as Category[] });
  const { data: templates } = useQuery({ queryKey: ["ticket-templates"], queryFn: async () => (await axiosClient.get("/ticket-templates")).data as Template[] });
  const { data: slas } = useQuery({ queryKey: ["ticket-slas"], queryFn: async () => (await axiosClient.get("/ticket-slas")).data as Sla[] });

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  function payload() {
    return {
      name: form.name,
      parentId: form.parentId ? Number(form.parentId) : null,
      defaultTemplateId: form.defaultTemplateId ? Number(form.defaultTemplateId) : null,
      defaultSlaId: form.defaultSlaId ? Number(form.defaultSlaId) : null,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/ticket-categories", payload()),
    meta: { successMessage: "Category created" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-categories"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/ticket-categories/${editingId}`, payload()),
    meta: { successMessage: "Category updated" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-categories"] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/ticket-categories/${id}`),
    meta: { successMessage: "Category deleted" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-categories"] }); setDeleting(null); },
  });

  function startEdit(c: Category) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      parentId: c.parentId != null ? String(c.parentId) : "",
      defaultTemplateId: c.defaultTemplateId != null ? String(c.defaultTemplateId) : "",
      defaultSlaId: c.defaultSlaId != null ? String(c.defaultSlaId) : "",
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId != null) updateMutation.mutate();
    else createMutation.mutate();
  }

  const columns: ColumnDef<Category, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "Parent Category", accessorFn: (r) => r.parent?.name ?? "—" },
    { header: "Default Template", accessorFn: (r) => r.defaultTemplate?.name ?? "—" },
    { header: "Default SLA", accessorFn: (r) => r.defaultSla?.name ?? "—" },
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
      <h3 className="mt-0">Ticket Categories</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Categories can nest under a parent, and each carries an optional default template and SLA — applied automatically when a ticket is created in that category (unless a business rule or the ticket itself overrides it).
      </p>
      <PermissionGate module="admin" action={editingId != null ? "edit" : "create"}>
        <form className="row gap-2 flex-wrap" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <input className="input" placeholder="Category name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ maxWidth: 200 }} />
          <select className="input" style={{ maxWidth: 180 }} value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
            <option value="">No parent</option>
            {data?.filter((c) => c.id !== editingId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 200 }} value={form.defaultTemplateId} onChange={(e) => setForm((f) => ({ ...f, defaultTemplateId: e.target.value }))}>
            <option value="">No default template</option>
            {templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 180 }} value={form.defaultSlaId} onChange={(e) => setForm((f) => ({ ...f, defaultSlaId: e.target.value }))}>
            <option value="">No default SLA</option>
            {slas?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {editingId != null ? "Save" : "Add Category"}
          </button>
          {editingId != null && <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>}
        </form>
      </PermissionGate>
      <DataTable
        tableId="admin.ticket-categories"
        exportModule="admin"
        importUrl="/ticket-categories/import"
        onImported={() => queryClient.invalidateQueries({ queryKey: ["ticket-categories"] })}
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        clientPageSize={10}
        emptyMessage="No ticket categories yet."
      />
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message="Tickets in this category will be uncategorized. Child categories will lose their parent link. Continue?"
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
