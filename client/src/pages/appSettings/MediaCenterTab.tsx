import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FormModal } from "../../components/FormModal";
import { Skeleton } from "../../components/Skeleton";
import { FilePreview } from "../../components/FilePreview";
import { usePermission } from "../../auth/PermissionGate";

interface MediaAsset {
  id: number;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  title: string | null;
  altText: string | null;
  caption: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface AttachedItem {
  sourceKey: string;
  id: number;
  displayName: string;
  url: string | null;
  sizeBytes: number | null;
  missing: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, string> = { IMAGE: "image", VIDEO: "video", AUDIO: "music", DOCUMENT: "fileText", OTHER: "file" };

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaLibrarySection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("");
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);

  const canCreate = usePermission("app-settings", "create");
  const canEdit = usePermission("app-settings", "edit");
  const canDelete = usePermission("app-settings", "delete");

  const { data, isLoading } = useQuery({
    queryKey: ["media-library", page, search, type],
    queryFn: async () => (await axiosClient.get("/media-center/library", { params: { page, pageSize: 24, search: search || undefined, type: type || undefined } })).data as {
      rows: MediaAsset[];
      total: number;
      page: number;
      totalPages: number;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return axiosClient.post("/media-center/library", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media-library"] }),
  });

  const updateMutation = useMutation({
    mutationFn: (values: { id: number; title: string; altText: string; caption: string; description: string }) =>
      axiosClient.patch(`/media-center/library/${values.id}`, { title: values.title, altText: values.altText, caption: values.caption, description: values.description }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["media-library"] }); setSelected(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/media-center/library/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["media-library"] }); setDeleting(null); },
  });

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search media..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <div className="row gap-1">
          {["", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"].map((t) => (
            <button key={t || "all"} className={`btn btn-sm ${type === t ? "btn-primary" : "btn-secondary"}`} onClick={() => { setType(t); setPage(1); }}>
              {t || "All"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {canCreate && (
          <>
            <button className="btn btn-primary btn-sm" disabled={uploadMutation.isPending} onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
          </>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-4" style={{ gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={140} />)}
        </div>
      )}
      {!isLoading && (data?.rows.length ?? 0) === 0 && <div className="empty-state card">No media uploaded yet.</div>}

      {!isLoading && data && data.rows.length > 0 && (
        <div className="grid grid-cols-4" style={{ gap: 12 }}>
          {data.rows.map((asset) => (
            <div key={asset.id} className="card" style={{ cursor: "pointer", padding: 8 }} onClick={() => setSelected(asset)}>
              <div style={{ aspectRatio: "4/3", background: "var(--color-surface-inset, #0d1117)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 6 }}>
                {asset.type === "IMAGE" ? (
                  <img src={asset.url} alt={asset.altText ?? asset.originalName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name={TYPE_ICON[asset.type] ?? "file"} size={32} />
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={asset.originalName}>
                {asset.title || asset.originalName}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>{formatBytes(asset.sizeBytes)}</div>
            </div>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><Icon name="chevronLeft" size={14} /></button>
          <span className="muted" style={{ fontSize: 12 }}>Page {page} of {data.totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}><Icon name="chevronRight" size={14} /></button>
        </div>
      )}

      {selected && (
        <FormModal title={selected.originalName} onClose={() => setSelected(null)} hideFooter maxWidth={560}>
          <div className="stack gap-3">
            <FilePreview
              src={selected.url}
              nameForKind={selected.originalName}
              mimeType={selected.mimeType}
              alt={selected.altText ?? selected.originalName}
              maxHeight={400}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              {selected.mimeType} · {formatBytes(selected.sizeBytes)}{selected.width ? ` · ${selected.width}×${selected.height}` : ""} · uploaded {dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm")}
            </div>
            <div className="row gap-2">
              <input className="input" readOnly value={selected.url} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(window.location.origin + selected.url)}>
                <Icon name="link" size={13} /> Copy URL
              </button>
            </div>
            <EditableMetaForm
              asset={selected}
              readOnly={!canEdit}
              submitting={updateMutation.isPending}
              onSave={(values) => updateMutation.mutate({ id: selected.id, ...values })}
            />
            {canDelete && (
              <button className="btn btn-danger btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setDeleting(selected)}>
                <Icon name="trash" size={13} /> Delete
              </button>
            )}
          </div>
        </FormModal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete media"
          message={`Delete "${deleting.originalName}"? Any rich-text content already referencing this file will show a broken link. This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function EditableMetaForm({
  asset,
  readOnly,
  submitting,
  onSave,
}: {
  asset: MediaAsset;
  readOnly: boolean;
  submitting: boolean;
  onSave: (values: { title: string; altText: string; caption: string; description: string }) => void;
}) {
  const [title, setTitle] = useState(asset.title ?? "");
  const [altText, setAltText] = useState(asset.altText ?? "");
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [description, setDescription] = useState(asset.description ?? "");

  return (
    <div className="stack gap-2">
      <div className="field"><label>Title</label><input className="input" disabled={readOnly} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Alt text</label><input className="input" disabled={readOnly} value={altText} onChange={(e) => setAltText(e.target.value)} /></div>
      <div className="field"><label>Caption</label><input className="input" disabled={readOnly} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
      <div className="field"><label>Description</label><textarea className="input" disabled={readOnly} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      {!readOnly && (
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={submitting} onClick={() => onSave({ title, altText, caption, description })}>
          {submitting ? "Saving..." : "Save details"}
        </button>
      )}
    </div>
  );
}

function AttachedPreviewModal({
  item,
  sourceLabel,
  onClose,
}: {
  item: AttachedItem;
  sourceLabel: string;
  onClose: () => void;
}) {
  // Public sources (asset photos, project attachments, site maps, avatars) already have a servable
  // `url` — use it directly so Range requests (video/audio scrubbing) work. Sources with no public
  // url (docAttachments/ticketAttachments aren't statically mounted) fall back to fetching the file
  // through the auth-gated preview route as a blob.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!item.url && !item.missing);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (item.url || item.missing) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    axiosClient
      .get(`/media-center/attached/${item.sourceKey}/${item.id}/preview`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.sourceKey, item.id, item.url, item.missing]);

  return (
    <FormModal title={item.displayName} onClose={onClose} hideFooter maxWidth={560}>
      <div className="stack gap-3">
        {item.missing ? (
          <div className="row gap-2" style={{ alignItems: "center", padding: 14, border: "1px dashed var(--color-border)", borderRadius: 8 }}>
            <Icon name="alertTriangle" size={24} />
            <span className="muted" style={{ fontSize: 12 }}>This file is missing on disk and can&apos;t be previewed.</span>
          </div>
        ) : loading ? (
          <Skeleton height={200} />
        ) : error ? (
          <div className="row gap-2" style={{ alignItems: "center", padding: 14, border: "1px dashed var(--color-border)", borderRadius: 8 }}>
            <Icon name="alertTriangle" size={24} />
            <span className="muted" style={{ fontSize: 12 }}>Couldn&apos;t load a preview for this file.</span>
          </div>
        ) : (
          <FilePreview
            src={item.url ?? blobUrl!}
            nameForKind={item.url ?? item.displayName}
            maxHeight={400}
          />
        )}
        <div className="muted" style={{ fontSize: 12 }}>
          {sourceLabel} · {formatBytes(item.sizeBytes)} · uploaded {dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}
        </div>
        {item.url && (
          <div className="row gap-2">
            <input className="input" readOnly value={item.url} onClick={(e) => (e.target as HTMLInputElement).select()} />
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(window.location.origin + item.url!)}>
              <Icon name="link" size={13} /> Copy URL
            </button>
          </div>
        )}
        {!item.url && blobUrl && (
          <a className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} href={blobUrl} download={item.displayName}>
            <Icon name="download" size={13} /> Download
          </a>
        )}
      </div>
    </FormModal>
  );
}

function AttachedUploadsSection() {
  const queryClient = useQueryClient();
  const [sourceKey, setSourceKey] = useState<string>("");
  const [deleting, setDeleting] = useState<AttachedItem | null>(null);
  const [previewing, setPreviewing] = useState<AttachedItem | null>(null);
  const canDelete = usePermission("app-settings", "delete");

  const { data: sources } = useQuery({
    queryKey: ["media-attached-sources"],
    queryFn: async () => (await axiosClient.get("/media-center/attached/sources")).data as { key: string; label: string }[],
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["media-attached", sourceKey],
    queryFn: async () => (await axiosClient.get("/media-center/attached", { params: { source: sourceKey || undefined, limit: 100 } })).data as AttachedItem[],
  });

  const deleteMutation = useMutation({
    mutationFn: (item: AttachedItem) => axiosClient.delete(`/media-center/attached/${item.sourceKey}/${item.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["media-attached"] }); setDeleting(null); },
  });

  return (
    <div className="stack gap-3">
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Files already uploaded through other features (asset photos, document/ticket/project attachments, avatars) — browse, audit, and clean up here.
      </p>
      <div className="row gap-1 flex-wrap">
        <button className={`btn btn-sm ${sourceKey === "" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSourceKey("")}>All</button>
        {(sources ?? []).map((s) => (
          <button key={s.key} className={`btn btn-sm ${sourceKey === s.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setSourceKey(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton height={200} />}
      {!isLoading && (items?.length ?? 0) === 0 && <div className="empty-state card">No attached files found.</div>}

      {!isLoading && items && items.length > 0 && (
        <table className="data-table">
          <thead><tr><th>File</th><th>Source</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.sourceKey}-${item.id}`}>
                <td>
                  {item.missing ? item.displayName : (
                    <button
                      className="btn-unstyled"
                      style={{ padding: 0, background: "none", border: "none", color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                      onClick={() => setPreviewing(item)}
                    >
                      {item.displayName}
                    </button>
                  )}
                  {item.missing && <span className="badge badge-danger" style={{ marginLeft: 6 }}>File missing on disk</span>}
                </td>
                <td>{sources?.find((s) => s.key === item.sourceKey)?.label ?? item.sourceKey}</td>
                <td>{formatBytes(item.sizeBytes)}</td>
                <td>{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}</td>
                <td>
                  <div className="row gap-1">
                    {!item.missing && (
                      <button className="btn btn-secondary btn-sm btn-icon" title="Preview" onClick={() => setPreviewing(item)}>
                        <Icon name="eye" size={12} />
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => setDeleting(item)}>
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {previewing && (
        <AttachedPreviewModal
          item={previewing}
          sourceLabel={sources?.find((s) => s.key === previewing.sourceKey)?.label ?? previewing.sourceKey}
          onClose={() => setPreviewing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete attached file"
          message={`Delete "${deleting.displayName}"? This removes it from wherever it's currently attached and cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting)}
        />
      )}
    </div>
  );
}

export function MediaCenterTab() {
  const [subTab, setSubTab] = useState<"library" | "attached">("library");

  return (
    <div className="stack gap-3">
      <div className="row gap-2">
        <button className={`btn btn-sm ${subTab === "library" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSubTab("library")}>
          <Icon name="image" size={13} /> Media Library
        </button>
        <button className={`btn btn-sm ${subTab === "attached" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSubTab("attached")}>
          <Icon name="paperclip" size={13} /> Attached Uploads
        </button>
      </div>
      {subTab === "library" && <MediaLibrarySection />}
      {subTab === "attached" && <AttachedUploadsSection />}
    </div>
  );
}
