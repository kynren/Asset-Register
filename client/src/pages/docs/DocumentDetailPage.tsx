import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";
import { SectionsView } from "./SectionsView";
import { DocumentFormModal } from "./DocumentFormModal";
import { DOC_TYPE_FIELDS, DOC_TYPE_LABELS, DocType } from "./docsConstants";

interface Attachment {
  id: number;
  fileName: string;
  createdAt: string;
}

interface DocumentFull {
  id: number;
  title: string;
  docType: DocType;
  category: string;
  collectionId: number;
  collection: { id: number; name: string } | null;
  summary: string | null;
  sections: Record<string, any>;
  tags: string[];
  isPublished: boolean;
  reviewDueDate: string | null;
  createdBy: { firstName: string; lastName: string } | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["doc", id],
    queryFn: async () => (await axiosClient.get(`/docs/${id}`)).data as DocumentFull,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["doc", id] });
    queryClient.invalidateQueries({ queryKey: ["docs"] });
  }

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/docs/${id}`),
    onSuccess: () => navigate("/docs"),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post(`/docs/${id}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: invalidate,
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => axiosClient.delete(`/docs/${id}/attachments/${attachmentId}`),
    onSuccess: invalidate,
  });

  // Attachments are served through an authenticated endpoint (not a public /uploads/ URL), so a
  // plain <a href> can't carry the Bearer token — fetch as a blob and trigger the download from
  // an object URL instead.
  async function downloadAttachment(attachmentId: number, fileName: string) {
    const res = await axiosClient.get(`/docs/${id}/attachments/${attachmentId}/file`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  if (isLoading || !doc) return <div className="ad-shell"><div style={{ padding: 22 }}>Loading...</div></div>;

  const reviewOverdue = doc.reviewDueDate && dayjs(doc.reviewDueDate).isBefore(dayjs());

  return (
    <div className="ad-shell">
      <div className="ad-header">
        <div className="ad-header-left">
          <button className="ad-back-btn" onClick={() => navigate("/docs")} title="Back to Docs & SOPs">
            <Icon name="arrowLeft" size={16} />
          </button>
          <div className="ad-title-block">
            <div className="ad-title-row">
              <h1 className="ad-title">{doc.title}</h1>
              <span className="ad-tag-badge">{DOC_TYPE_LABELS[doc.docType]}</span>
            </div>
            <div className="ad-meta-row">
              <span>Collection: <strong>{doc.collection?.name ?? "—"}</strong></span>
              <span>Category: <strong>{doc.category}</strong></span>
              <span>Author: <strong>{doc.createdBy ? `${doc.createdBy.firstName} ${doc.createdBy.lastName}` : "—"}</strong></span>
              <span>Updated: <strong>{dayjs(doc.updatedAt).format("DD MMM YYYY, HH:mm")}</strong></span>
            </div>
          </div>
        </div>
        <div className="ad-header-right">
          {!doc.isPublished && <div className="ad-active-badge inactive">DRAFT</div>}
          {doc.reviewDueDate && (
            <div className={`ad-active-badge ${reviewOverdue ? "inactive" : ""}`}>
              {reviewOverdue ? "REVIEW OVERDUE" : `Review due ${dayjs(doc.reviewDueDate).format("DD MMM YYYY")}`}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 22 }}>
        <div className="row gap-2" style={{ marginBottom: 16, justifyContent: "flex-end" }}>
          <PermissionGate module="docs" action="edit">
            <button className="ad-btn ad-btn-primary" onClick={() => setEditing(true)}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </PermissionGate>
          <PermissionGate module="docs" action="delete">
            <button className="ad-btn ad-btn-danger" onClick={() => setDeleting(true)}>
              <Icon name="trash" size={13} /> Delete
            </button>
          </PermissionGate>
        </div>

        {doc.summary && <p className="muted" style={{ marginTop: 0 }}>{doc.summary}</p>}
        {doc.tags.length > 0 && (
          <div className="row gap-1 flex-wrap" style={{ marginBottom: 18 }}>
            {doc.tags.map((t) => <span key={t} className="badge badge-neutral">{t}</span>)}
          </div>
        )}

        <SectionsView fields={DOC_TYPE_FIELDS[doc.docType]} sections={doc.sections} />

        <div className="ad-panel" style={{ marginTop: 18 }}>
          <div className="row gap-2" style={{ justifyContent: "space-between" }}>
            <div className="ad-panel-title" style={{ margin: 0 }}>Attachments</div>
            <PermissionGate module="docs" action="edit">
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
              <button className="ad-btn ad-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                <Icon name="upload" size={12} /> {uploadMutation.isPending ? "Uploading..." : "Add Attachment"}
              </button>
            </PermissionGate>
          </div>

          {doc.attachments.length === 0 ? (
            <div className="ad-empty">No attachments (manuals, diagrams, forms) added yet.</div>
          ) : (
            <div className="stack gap-2" style={{ marginTop: 10 }}>
              {doc.attachments.map((a) => (
                <div key={a.id} className="ad-row-card">
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <Icon name="file" size={14} />
                    <div>
                      <div className="ad-row-value">{a.fileName}</div>
                      <div className="ad-row-label" style={{ textTransform: "none" }}>{dayjs(a.createdAt).format("DD MMM YYYY")}</div>
                    </div>
                  </div>
                  <div className="row gap-1">
                    <button className="ad-btn" onClick={() => downloadAttachment(a.id, a.fileName)}><Icon name="download" size={12} /></button>
                    <PermissionGate module="docs" action="edit">
                      <button className="ad-btn ad-btn-danger" onClick={() => deleteAttachmentMutation.mutate(a.id)}><Icon name="trash" size={12} /></button>
                    </PermissionGate>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <DocumentFormModal
          document={doc}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); invalidate(); }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete document"
          message={`Are you sure you want to delete "${doc.title}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </div>
  );
}
