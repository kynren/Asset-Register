import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { PermissionGate } from "../../auth/PermissionGate";
import { SiteMapEditor } from "./SiteMapEditor";

interface SiteMapSummary {
  id: number;
  name: string;
  imageUrl: string;
  sortOrder: number;
}

export function SiteMapTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<SiteMapSummary | null>(null);
  const [deleting, setDeleting] = useState<SiteMapSummary | null>(null);
  const queryClient = useQueryClient();

  const { data: maps, isLoading } = useQuery({
    queryKey: ["lighting-site-maps"],
    queryFn: async () => (await axiosClient.get("/lighting/site-maps")).data as SiteMapSummary[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["lighting-site-maps"] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/site-maps/${id}`),
    onSuccess: () => { invalidate(); setDeleting(null); if (selectedId === deleting?.id) setSelectedId(null); },
  });

  if (selectedId !== null) {
    return <SiteMapEditor siteMapId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Upload a floor plan and place lights on it to see coverage and status at a glance.
        </p>
        <PermissionGate module="lighting" action="create">
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add Site Map</button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <Skeleton height={160} /><Skeleton height={160} /><Skeleton height={160} />
        </div>
      )}

      {!isLoading && (maps ?? []).length === 0 && (
        <div className="empty-state card">No site maps yet — add one to place lights on a floor plan.</div>
      )}

      {!isLoading && (maps ?? []).length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {(maps ?? []).map((m) => (
            <div key={m.id} className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => setSelectedId(m.id)}>
              <div style={{ height: 120, background: "var(--color-bg)", overflow: "hidden" }}>
                <img src={m.imageUrl} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div className="row gap-2" style={{ padding: "10px 12px", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 13 }}>{m.name}</strong>
                <div className="row gap-1" onClick={(e) => e.stopPropagation()}>
                  <PermissionGate module="lighting" action="edit">
                    <button className="btn-icon" title="Rename" onClick={() => setRenaming(m)}><Icon name="edit" size={12} /></button>
                  </PermissionGate>
                  <PermissionGate module="lighting" action="delete">
                    <button className="btn-icon" title="Delete" onClick={() => setDeleting(m)}><Icon name="trash" size={12} /></button>
                  </PermissionGate>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || renaming) && (
        <SiteMapFormModal siteMap={renaming} onClose={() => { setAdding(false); setRenaming(null); }} onSaved={invalidate} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete site map"
          message={`Delete "${deleting.name}"? Device placements on it are removed, but the devices themselves are kept. This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function SiteMapFormModal({ siteMap, onClose, onSaved }: { siteMap: SiteMapSummary | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(siteMap?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("name", name);
      if (file) formData.append("file", file);
      const config = { headers: { "Content-Type": "multipart/form-data" } };
      return siteMap ? axiosClient.patch(`/lighting/site-maps/${siteMap.id}`, formData, config) : axiosClient.post("/lighting/site-maps", formData, config);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <FormModal
      title={siteMap ? "Rename / Replace Site Map" : "Add Site Map"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!name.trim() || (!siteMap && !file)}
    >
      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ground Floor" autoFocus /></div>
      <div className="field">
        <label>{siteMap ? "Replace Image (optional)" : "Floor Plan Image *"}</label>
        <input ref={inputRef} className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>PNG, JPEG, or WebP, up to 5MB.</div>
      </div>
    </FormModal>
  );
}
