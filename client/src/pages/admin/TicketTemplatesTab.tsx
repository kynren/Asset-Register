import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";

interface TemplateField {
  fieldKey: string;
  mode: "HIDDEN" | "MANDATORY" | "READONLY" | "PREDEFINED";
  predefinedValue: string | null;
}

interface Template {
  id: number;
  name: string;
  itilType: string;
  isDefault: boolean;
  fields: TemplateField[];
}

const ITIL_TYPES = ["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];
const FIELD_KEYS = ["title", "description", "priority", "categoryId", "assetId", "locationId", "slaId"];
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  categoryId: "Category",
  assetId: "Asset",
  locationId: "Location",
  slaId: "SLA",
};
const MODES = ["HIDDEN", "MANDATORY", "READONLY", "PREDEFINED"] as const;

function FieldsEditor({ template }: { template: Template }) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, TemplateField>>(() => {
    const map: Record<string, TemplateField> = {};
    for (const f of template.fields) map[f.fieldKey] = f;
    return map;
  });

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put(`/ticket-templates/${template.id}/fields`, { fields: Object.values(fields) }),
    meta: { successMessage: "Template fields saved" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-templates"] }),
  });

  function setMode(key: string, mode: TemplateField["mode"] | "") {
    setFields((prev) => {
      const next = { ...prev };
      if (!mode) delete next[key];
      else next[key] = { fieldKey: key, mode, predefinedValue: next[key]?.predefinedValue ?? null };
      return next;
    });
  }

  function setPredefinedValue(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], predefinedValue: value } }));
  }

  return (
    <div className="stack gap-2" style={{ padding: "10px 0" }}>
      {FIELD_KEYS.map((key) => {
        const f = fields[key];
        return (
          <div key={key} className="row gap-2" style={{ alignItems: "center" }}>
            <span style={{ minWidth: 100, fontSize: 13 }}>{FIELD_LABELS[key]}</span>
            <select className="input" style={{ maxWidth: 160 }} value={f?.mode ?? ""} onChange={(e) => setMode(key, e.target.value as any)}>
              <option value="">Default behavior</option>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {f?.mode === "PREDEFINED" && (
              <input className="input" style={{ maxWidth: 200 }} placeholder="Predefined value" value={f.predefinedValue ?? ""} onChange={(e) => setPredefinedValue(key, e.target.value)} />
            )}
          </div>
        );
      })}
      <PermissionGate module="admin" action="edit">
        <button className="btn btn-primary btn-sm" style={{ width: "fit-content" }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Save Field Rules
        </button>
      </PermissionGate>
    </div>
  );
}

export function TicketTemplatesTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [itilType, setItilType] = useState("INCIDENT");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["ticket-templates"], queryFn: async () => (await axiosClient.get("/ticket-templates")).data as Template[] });

  function resetForm() {
    setName("");
    setItilType("INCIDENT");
    setEditingId(null);
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/ticket-templates", { name, itilType }),
    meta: { successMessage: "Template created" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-templates"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/ticket-templates/${editingId}`, { name, itilType }),
    meta: { successMessage: "Template updated" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-templates"] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/ticket-templates/${id}`),
    meta: { successMessage: "Template deleted" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-templates"] }); setDeleting(null); },
  });

  function startEdit(t: Template) {
    setEditingId(t.id);
    setName(t.name);
    setItilType(t.itilType);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId != null) updateMutation.mutate();
    else createMutation.mutate();
  }

  const columns: ColumnDef<Template, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "ITIL Type", cell: ({ row }) => <StatusBadge status={row.original.itilType} /> },
    { header: "Fields Configured", accessorFn: (r) => r.fields.length },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <button className="btn btn-secondary btn-sm" onClick={() => setExpandedId(expandedId === row.original.id ? null : row.original.id)}>
            {expandedId === row.original.id ? "Hide Fields" : "Configure Fields"}
          </button>
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

  const expanded = data?.find((t) => t.id === expandedId);

  return (
    <div className="card">
      <h3 className="mt-0">Ticket Templates</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        A template controls which fields are hidden, mandatory, read-only, or pre-filled when a ticket is created. Mandatory-field enforcement happens client-side on the ticket form.
      </p>
      <PermissionGate module="admin" action={editingId != null ? "edit" : "create"}>
        <form className="row gap-2 flex-wrap" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <input className="input" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 220 }} />
          <select className="input" style={{ maxWidth: 160 }} value={itilType} onChange={(e) => setItilType(e.target.value)}>
            {ITIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {editingId != null ? "Save" : "Add Template"}
          </button>
          {editingId != null && <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>}
        </form>
      </PermissionGate>
      <DataTable tableId="admin.ticket-templates" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={10} emptyMessage="No templates defined yet." exportModule="admin" />
      {expanded && (
        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 10 }}>
          <h4>{expanded.name} — Field Rules</h4>
          <FieldsEditor key={expanded.id} template={expanded} />
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message="Tickets already created from this template are unaffected. Continue?"
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
