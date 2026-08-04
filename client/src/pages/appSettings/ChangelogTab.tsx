import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FormModal } from "../../components/FormModal";
import { PermissionGate } from "../../auth/PermissionGate";

interface ChangelogEntry {
  id: number;
  title: string;
  summary: string | null;
  items: string[];
  publishedAt: string;
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

interface FormState {
  title: string;
  summary: string;
  itemsText: string;
}

function emptyForm(): FormState {
  return { title: "", summary: "", itemsText: "" };
}

function toPayload(form: FormState) {
  return {
    title: form.title,
    summary: form.summary || undefined,
    items: form.itemsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

// Lets a Super/System Admin publish "what's new" entries — the moment one is created, every
// user who hasn't seen it yet gets it surfaced via ChangelogModal.tsx the next time they load
// the app (see changelog.routes.ts's GET /unseen).
export function ChangelogTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChangelogEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleting, setDeleting] = useState<ChangelogEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["changelog-entries"],
    queryFn: async () => (await axiosClient.get("/changelog")).data as ChangelogEntry[],
  });

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function startEdit(entry: ChangelogEntry) {
    setEditing(entry);
    setForm({ title: entry.title, summary: entry.summary ?? "", itemsText: entry.items.join("\n") });
    setShowForm(true);
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/changelog", toPayload(form)),
    meta: { successMessage: "Changelog entry published" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/changelog/${editing!.id}`, toPayload(form)),
    meta: { successMessage: "Changelog entry updated" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/changelog/${id}`),
    meta: { successMessage: "Changelog entry deleted" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
      setDeleting(null);
    },
  });

  const columns: ColumnDef<ChangelogEntry, any>[] = [
    { header: "Title", accessorKey: "title" },
    { header: "Summary", accessorFn: (r) => r.summary ?? "—" },
    { header: "Items", accessorFn: (r) => r.items.length },
    { header: "Published", accessorFn: (r) => r.publishedAt, cell: ({ row }) => dayjs(row.original.publishedAt).format("D MMM YYYY") },
    { header: "Published By", accessorFn: (r) => (r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : "—") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="app-settings" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => startEdit(row.original)}><Icon name="edit" size={13} /></button>
          </PermissionGate>
          <PermissionGate module="app-settings" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}><Icon name="trash" size={13} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h3 className="mt-0 mb-0">Changelog</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            "What's New" entries shown to every user in a modal the first time they load the app after publishing.
          </p>
        </div>
        <PermissionGate module="app-settings" action="create">
          <button className="btn btn-primary btn-sm" onClick={startCreate}>
            <Icon name="star" size={13} /> New Entry
          </button>
        </PermissionGate>
      </div>

      <DataTable
        tableId="appSettings.changelog"
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        clientPageSize={10}
        emptyMessage="No changelog entries yet."
      />

      {showForm && (
        <FormModal
          title={editing ? "Edit Changelog Entry" : "New Changelog Entry"}
          onClose={closeForm}
          onSubmit={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
          submitting={createMutation.isPending || updateMutation.isPending}
          submitDisabled={!form.title.trim()}
          submitLabel={editing ? "Save" : "Publish"}
        >
          <div className="stack gap-2">
            <div className="field">
              <label>Title *</label>
              <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Relay-aware camera diagnostics" />
            </div>
            <div className="field">
              <label>Summary</label>
              <input className="input" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="One-line description shown under the title" />
            </div>
            <div className="field">
              <label>Highlights (one per line)</label>
              <textarea
                className="input"
                rows={6}
                value={form.itemsText}
                onChange={(e) => setForm((f) => ({ ...f, itemsText: e.target.value }))}
                placeholder={"Camera/NVR test connection now routes through the relay agent\nEvery table now defaults to list view"}
              />
            </div>
          </div>
        </FormModal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.title}"`}
          message="This entry will no longer appear in anyone's What's New modal. Continue?"
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
