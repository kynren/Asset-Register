import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../Icon";
import { FormModal } from "../FormModal";
import { ChipSelect } from "../ChipSelect";

export interface SavedViewSummary {
  id: number;
  name: string;
  tableId: string;
  isDefault: boolean;
  isOwner: boolean;
  canEdit: boolean;
  ownerName?: string;
}

interface ShareRow {
  id: number;
  canEdit: boolean;
  userName: string | null;
  userEmail: string | null;
  teamName: string | null;
}

// Drop-in toolbar for any DataTable page that wants named, shareable filter/column presets (mirrors
// GLPI's Saved Searches). The host page owns its own filter/column state shape — this component
// treats `currentFilters` as an opaque blob to persist and hands back whatever was saved via
// `onApply` when a view is selected, so it works for any page's filter shape without a shared schema.
export function SavedViewBar({
  tableId,
  currentFilters,
  onApply,
}: {
  tableId: string;
  currentFilters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [showSharedWithMe, setShowSharedWithMe] = useState(false);
  const appliedDefaultRef = useRef(false);

  const { data: views } = useQuery({
    queryKey: ["saved-views", tableId],
    queryFn: async () => (await axiosClient.get("/saved-views", { params: { tableId } })).data as SavedViewSummary[],
  });
  // Auto-apply the caller's default saved view (if any) the first time this table's views load —
  // matches the Dashboard feature's "opens to your default" behavior. Only fires once per mount.
  useEffect(() => {
    if (appliedDefaultRef.current || !views) return;
    appliedDefaultRef.current = true;
    const def = views.find((v) => v.isDefault && v.isOwner);
    if (def) applyView(def.id);
  }, [views]);

  async function applyView(id: number) {
    setActiveId(id);
    const res = await axiosClient.get(`/saved-views/${id}/filters`);
    onApply(res.data.filters ?? {});
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => axiosClient.post("/saved-views", { name, tableId, filters: currentFilters }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", tableId] });
      setActiveId(res.data.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.put(`/saved-views/${activeId}/filters`, { filters: currentFilters }),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => axiosClient.patch(`/saved-views/${activeId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-views", tableId] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/saved-views/${activeId}`, { isDefault: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-views", tableId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/saved-views/${activeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", tableId] });
      setActiveId(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => axiosClient.post(`/saved-views/${activeId}/duplicate`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", tableId] });
      setActiveId(res.data.id);
    },
  });

  const active = views?.find((v) => v.id === activeId);

  return (
    <div className="row gap-2 flex-wrap" style={{ alignItems: "center" }}>
      <ChipSelect
        style={{ width: "auto", minWidth: 180 }}
        value={activeId != null ? String(activeId) : ""}
        onChange={(v) => (v ? applyView(Number(v)) : setActiveId(null))}
        placeholder="Saved Views…"
        options={[
          { value: "", label: "Saved Views…" },
          ...(views ?? []).map((v) => ({
            value: String(v.id),
            label: `${v.name}${v.isDefault ? " ★" : ""}${!v.isOwner ? ` — shared by ${v.ownerName}` : ""}`,
          })),
        ]}
      />

      {renaming ? (
        <>
          <input className="input" style={{ width: 160 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-sm" disabled={!renameValue.trim()} onClick={() => { renameMutation.mutate(renameValue.trim()); setRenaming(false); }}>Save</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(false)}>Cancel</button>
        </>
      ) : showNewInput ? (
        <>
          <input className="input" style={{ width: 160 }} placeholder="View name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-sm" disabled={!newName.trim()} onClick={() => { createMutation.mutate(newName.trim()); setNewName(""); setShowNewInput(false); }}>Save View</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewInput(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewInput(true)}>
            <Icon name="plus" size={12} /> Save Current View
          </button>
          {active?.isOwner || active?.canEdit ? (
            <button className="btn btn-secondary btn-sm" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
              <Icon name="check" size={12} /> Update
            </button>
          ) : null}
          {active?.isOwner && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => { setRenameValue(active.name); setRenaming(true); }}>
                <Icon name="edit" size={12} /> Rename
              </button>
              {!active.isDefault && (
                <button className="btn btn-secondary btn-sm" onClick={() => setDefaultMutation.mutate()}>
                  <Icon name="star" size={12} /> Set as Default
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowShare(true)}>
                <Icon name="link" size={12} /> Share
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => deleteMutation.mutate()}>
                <Icon name="trash" size={12} /> Delete
              </button>
            </>
          )}
          {active && !active.isOwner && (
            <button className="btn btn-secondary btn-sm" onClick={() => duplicateMutation.mutate()}>
              <Icon name="paperclip" size={12} /> Duplicate to My Views
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSharedWithMe(true)}>
            <Icon name="mail" size={12} /> Shared with Me
          </button>
        </>
      )}

      {showShare && active && (
        <ShareSavedViewModal savedViewId={active.id} savedViewName={active.name} onClose={() => setShowShare(false)} />
      )}
      {showSharedWithMe && (
        <SharedWithMeSavedViewsModal tableId={tableId} onClose={() => setShowSharedWithMe(false)} onOpen={(id) => { applyView(id); setShowSharedWithMe(false); }} />
      )}
    </div>
  );
}

function ShareSavedViewModal({ savedViewId, savedViewName, onClose }: { savedViewId: number; savedViewName: string; onClose: () => void }) {
  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [targetId, setTargetId] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const queryClient = useQueryClient();

  const { data: shares } = useQuery({
    queryKey: ["saved-view-shares", savedViewId],
    queryFn: async () => (await axiosClient.get(`/saved-views/${savedViewId}/shares`)).data as ShareRow[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: async () => (await axiosClient.get("/teams")).data });

  const shareMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/saved-views/${savedViewId}/shares`, {
        [targetType === "user" ? "userId" : "teamId"]: Number(targetId),
        canEdit,
      }),
    meta: { successMessage: "Saved view shared" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-view-shares", savedViewId] });
      setTargetId("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (shareId: number) => axiosClient.delete(`/saved-views/${savedViewId}/shares/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-view-shares", savedViewId] }),
  });

  return (
    <FormModal title={`Share "${savedViewName}"`} onClose={onClose} hideFooter maxWidth={480}>
      <div className="field">
        <label>Share With</label>
        <div className="row gap-2" style={{ marginBottom: 8 }}>
          <ChipSelect
            style={{ width: "auto" }}
            value={targetType}
            onChange={(v) => { setTargetType(v as "user" | "team"); setTargetId(""); }}
            options={[
              { value: "user", label: "A User" },
              { value: "team", label: "A Team" },
            ]}
          />
          <ChipSelect
            value={targetId}
            onChange={setTargetId}
            placeholder="Select..."
            options={[
              { value: "", label: "Select..." },
              ...(targetType === "user"
                ? (users ?? []).map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))
                : (teams ?? []).map((t: any) => ({ value: String(t.id), label: t.name }))),
            ]}
          />
        </div>
        <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} />
          Allow editing (overwrite this saved view's filters)
        </label>
        <button className="btn btn-primary btn-sm" disabled={!targetId || shareMutation.isPending} onClick={() => shareMutation.mutate()}>
          Share
        </button>
      </div>

      <div className="field">
        <label>Currently Shared With</label>
        {!shares || shares.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Not shared with anyone yet.</div>
        ) : (
          <div className="stack gap-1">
            {shares.map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{s.userName ?? `Team: ${s.teamName}`}</span>
                  <span className="badge badge-neutral" style={{ marginLeft: 8 }}>{s.canEdit ? "Can edit" : "View only"}</span>
                </div>
                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => removeMutation.mutate(s.id)} title="Remove share">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormModal>
  );
}

function SharedWithMeSavedViewsModal({ tableId, onClose, onOpen }: { tableId: string; onClose: () => void; onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["saved-views-shared-with-me-modal", tableId],
    queryFn: async () => (await axiosClient.get("/saved-views/shared-with-me", { params: { tableId } })).data as SavedViewSummary[],
  });

  return (
    <FormModal title="Shared with Me" onClose={onClose} hideFooter maxWidth={480}>
      {isLoading ? (
        <div className="muted">Loading...</div>
      ) : !data || data.length === 0 ? (
        <div className="empty-state">No saved views have been shared with you for this table yet.</div>
      ) : (
        <div className="stack gap-1">
          {data.map((v) => (
            <div key={v.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Shared by {v.ownerName} · {v.canEdit ? "Can edit" : "View only"}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => onOpen(v.id)}>
                <Icon name="eye" size={12} /> Open
              </button>
            </div>
          ))}
        </div>
      )}
    </FormModal>
  );
}
