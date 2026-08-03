import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";

interface Condition { field: string; operator: string; value: string }
interface Action { field: string; value: string }
interface Rule { id: number; name: string; isActive: boolean; order: number; conditions: Condition[]; actions: Action[] }

const CONDITION_FIELDS = ["title", "description", "priority", "categoryId", "assetId", "locationId", "itilType", "type", "requesterId"];
const OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];
const ACTION_FIELDS = ["categoryId", "assetId", "locationId", "templateId", "slaId", "priority", "itilType", "type"];

function emptyRuleForm(): { name: string; conditions: Condition[]; actions: Action[] } {
  return { name: "", conditions: [{ field: "title", operator: "contains", value: "" }], actions: [{ field: "priority", value: "" }] };
}

export function TicketRulesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyRuleForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["ticket-rules"], queryFn: async () => (await axiosClient.get("/ticket-rules")).data as Rule[] });

  function resetForm() {
    setForm(emptyRuleForm());
    setEditingId(null);
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/ticket-rules", { name: form.name, conditions: form.conditions, actions: form.actions, order: data?.length ?? 0 }),
    meta: { successMessage: "Rule created" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-rules"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/ticket-rules/${editingId}`, { name: form.name, conditions: form.conditions, actions: form.actions }),
    meta: { successMessage: "Rule updated" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-rules"] }); resetForm(); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => axiosClient.patch(`/ticket-rules/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/ticket-rules/${id}`),
    meta: { successMessage: "Rule deleted" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-rules"] }); setDeleting(null); },
  });

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setForm({ name: r.name, conditions: r.conditions.length ? r.conditions : emptyRuleForm().conditions, actions: r.actions.length ? r.actions : emptyRuleForm().actions });
  }

  function updateCondition(i: number, patch: Partial<Condition>) {
    setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  }
  function updateAction(i: number, patch: Partial<Action>) {
    setForm((f) => ({ ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    if (editingId != null) updateMutation.mutate();
    else createMutation.mutate();
  }

  const columns: ColumnDef<Rule, any>[] = [
    { header: "Order", accessorKey: "order" },
    { header: "Name", accessorKey: "name" },
    { header: "Conditions", accessorFn: (r) => r.conditions.length },
    { header: "Actions", accessorFn: (r) => r.actions.length },
    {
      header: "Active",
      cell: ({ row }) => (
        <PermissionGate module="admin" action="edit" fallback={row.original.isActive ? "Yes" : "No"}>
          <button className={`btn btn-sm ${row.original.isActive ? "btn-primary" : "btn-secondary"}`} onClick={() => toggleActiveMutation.mutate({ id: row.original.id, isActive: !row.original.isActive })}>
            {row.original.isActive ? "Active" : "Inactive"}
          </button>
        </PermissionGate>
      ),
    },
    {
      header: "",
      id: "actions_col",
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
      <h3 className="mt-0">Business Rules</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Rules run in order on every new ticket, before SLA resolution. All conditions on a rule must match; a later rule's actions can override an earlier one's.
      </p>

      <PermissionGate module="admin" action={editingId != null ? "edit" : "create"}>
        <div className="stack gap-2" style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <input className="input" placeholder="Rule name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ maxWidth: 300 }} />

          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Conditions (all must match)</label>
            {form.conditions.map((c, i) => (
              <div key={i} className="row gap-2 flex-wrap" style={{ marginTop: 6 }}>
                <select className="input" style={{ maxWidth: 160 }} value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                  {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select className="input" style={{ maxWidth: 160 }} value={c.operator} onChange={(e) => updateCondition(i, { operator: e.target.value })}>
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {c.operator !== "is_empty" && c.operator !== "is_not_empty" && (
                  <input className="input" style={{ maxWidth: 200 }} placeholder="Value" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} />
                )}
                <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "title", operator: "contains", value: "" }] }))}>
              <Icon name="plus" size={12} /> Add Condition
            </button>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Actions (applied when conditions match)</label>
            {form.actions.map((a, i) => (
              <div key={i} className="row gap-2 flex-wrap" style={{ marginTop: 6 }}>
                <select className="input" style={{ maxWidth: 160 }} value={a.field} onChange={(e) => updateAction(i, { field: e.target.value })}>
                  {ACTION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <input className="input" style={{ maxWidth: 200 }} placeholder="Value" value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} />
                <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }))}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, { field: "priority", value: "" }] }))}>
              <Icon name="plus" size={12} /> Add Action
            </button>
          </div>

          <div className="row gap-2">
            <button className="btn btn-primary btn-sm" disabled={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
              {editingId != null ? "Save Rule" : "Add Rule"}
            </button>
            {editingId != null && <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>}
          </div>
        </div>
      </PermissionGate>

      <DataTable tableId="admin.ticket-rules" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={10} emptyMessage="No business rules defined yet." />

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message="This rule will no longer run on new tickets. Continue?"
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
