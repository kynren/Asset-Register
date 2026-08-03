import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export interface AssetCollectionItem {
  id: number;
  name: string;
  description: string | null;
  categoryCount: number;
}

export function AssetCollectionsManageModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AssetCollectionItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: collections, isLoading } = useQuery({
    queryKey: ["asset-collections"],
    queryFn: async () => (await axiosClient.get("/asset-collections")).data as AssetCollectionItem[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["asset-collections"] });
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/asset-collections", { name: newName, description: newDescription || undefined }),
    onSuccess: () => { setNewName(""); setNewDescription(""); setError(null); invalidate(); },
    onError: (err: any) => setError(err.response?.data?.error || "Could not create collection."),
  });

  const renameMutation = useMutation({
    mutationFn: (id: number) => axiosClient.patch(`/asset-collections/${id}`, { name: editName }),
    onSuccess: () => { setEditingId(null); invalidate(); },
    onError: (err: any) => setError(err.response?.data?.error || "Could not rename collection."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/asset-collections/${id}`),
    onSuccess: () => { setDeleteTarget(null); invalidate(); },
    onError: (err: any) => setError(err.response?.data?.error || "Could not delete collection."),
  });

  return (
    <FormModal title="Manage Collections" onClose={onClose} hideFooter maxWidth={520}>
      {error && <div className="alert alert-danger">{error}</div>}

      <PermissionGate module="admin" action="create">
        <div className="row gap-2 flex-wrap" style={{ marginBottom: 16, alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <label>New Collection Name</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Office" />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <label>Description (optional)</label>
            <input className="input" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Icon name="plus" size={13} /> Add
          </button>
        </div>
      </PermissionGate>

      <div className="stack gap-2">
        {isLoading && <div className="muted">Loading...</div>}
        {!isLoading && (collections ?? []).length === 0 && <div className="empty-state">No collections yet — add one above.</div>}
        {(collections ?? []).map((c) => (
          <div
            key={c.id}
            className="row gap-2"
            style={{ justifyContent: "space-between", alignItems: "center", border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px 14px" }}
          >
            {editingId === c.id ? (
              <input className="input" value={editName} autoFocus onChange={(e) => setEditName(e.target.value)} style={{ flex: 1, marginRight: 8 }} />
            ) : (
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                {c.description && <div className="muted" style={{ fontSize: 12 }}>{c.description}</div>}
                <div className="muted" style={{ fontSize: 11 }}>{c.categoryCount} {c.categoryCount === 1 ? "category" : "categories"}</div>
              </div>
            )}
            <PermissionGate module="admin" action="edit">
              <div className="row gap-1">
                {editingId === c.id ? (
                  <>
                    <button className="btn btn-primary btn-sm btn-icon" disabled={!editName.trim() || renameMutation.isPending} onClick={() => renameMutation.mutate(c.id)}>
                      <Icon name="check" size={12} />
                    </button>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditingId(null)}><Icon name="close" size={12} /></button>
                  </>
                ) : (
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { setEditingId(c.id); setEditName(c.name); }}><Icon name="edit" size={12} /></button>
                )}
                <PermissionGate module="admin" action="delete">
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    disabled={c.categoryCount > 0}
                    title={c.categoryCount > 0 ? "Move or delete its categories first" : "Delete collection"}
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </PermissionGate>
              </div>
            </PermissionGate>
          </div>
        ))}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete collection"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </FormModal>
  );
}
