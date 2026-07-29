import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { FilterBar } from "../../components/FilterBar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { VaultEntry, VaultEntryRow } from "./VaultEntryRow";
import { VaultEntryModal, VaultEntryFormValues } from "./VaultEntryModal";

export function VaultTab() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [deleting, setDeleting] = useState<VaultEntry | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vault"],
    queryFn: async () => (await axiosClient.get("/vault")).data as VaultEntry[],
  });

  const createMutation = useMutation({
    mutationFn: (v: VaultEntryFormValues) => axiosClient.post("/vault", v),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vault"] }); setShowAdd(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (v: VaultEntryFormValues) => axiosClient.patch(`/vault/${editing!.id}`, { ...v, password: v.password || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vault"] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/vault/${deleting!.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vault"] }); setDeleting(null); },
  });

  const filtered = (data ?? []).filter((e) => {
    const q = search.toLowerCase();
    return !q || e.title.toLowerCase().includes(q) || (e.username ?? "").toLowerCase().includes(q) || (e.websiteUrl ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <h3 className="mt-0 mb-0">Password Vault</h3>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
              Securely store website and app credentials, encrypted with AES-128. Only visible to you.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} /> Add Password</button>
        </div>

        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search saved passwords..." />

        {isLoading && <div className="row" style={{ justifyContent: "center", padding: 30 }}><div className="spinner" /></div>}
        {!isLoading && filtered.length === 0 && <div className="empty-state">No saved passwords yet. Add your first one to get started.</div>}
        {filtered.map((entry) => (
          <VaultEntryRow key={entry.id} entry={entry} onEdit={() => setEditing(entry)} onDelete={() => setDeleting(entry)} />
        ))}
      </div>

      {showAdd && (
        <VaultEntryModal onClose={() => setShowAdd(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}
      {editing && (
        <VaultEntryModal
          initial={{ title: editing.title, websiteUrl: editing.websiteUrl ?? "", username: editing.username ?? "", notes: editing.notes ?? "", password: "" }}
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete password"
          message={`Delete the saved password for "${deleting.title}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </div>
  );
}
