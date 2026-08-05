import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "./Icon";
import { ConfirmDialog } from "./ConfirmDialog";

interface RecordCommentRow {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; firstName: string; lastName: string; avatarUrl: string | null };
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

// Generic comment/update thread, reusable on any detail page — entityType must be in the backend's
// ALLOWED_ENTITY_TYPES allowlist (see server/src/modules/comments/comments.routes.ts).
export function CommentThread({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const queryKey = ["record-comments", entityType, entityId];
  const { data: comments, isLoading } = useQuery<RecordCommentRow[]>({
    queryKey,
    queryFn: async () => (await axiosClient.get(`/comments/${entityType}/${entityId}`)).data,
  });

  const addMutation = useMutation({
    mutationFn: async () => (await axiosClient.post(`/comments/${entityType}/${entityId}`, { body: draft })).data,
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (id: number) => (await axiosClient.patch(`/comments/${id}`, { body: editDraft })).data,
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => axiosClient.delete(`/comments/${id}`),
    onSuccess: () => {
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <div className="field">
      <label>Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}</label>

      {isLoading ? (
        <p className="muted">Loading comments...</p>
      ) : !comments || comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <div className="stack gap-2">
          {comments.map((c) => {
            const isOwn = c.author.id === user?.id;
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className="row gap-2" style={{ alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--color-primary-soft)",
                    color: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {initials(c.author.firstName, c.author.lastName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row gap-2" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                      {c.author.firstName} {c.author.lastName}
                      <span className="muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                        {new Date(c.createdAt).toLocaleString()}
                        {c.updatedAt !== c.createdAt ? " (edited)" : ""}
                      </span>
                    </span>
                    {isOwn && !isEditing && (
                      <div className="row gap-1">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm btn-icon"
                          title="Edit comment"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditDraft(c.body);
                          }}
                        >
                          <Icon name="edit" size={12} />
                        </button>
                        <button type="button" className="btn btn-danger btn-sm btn-icon" title="Delete comment" onClick={() => setDeleteId(c.id)}>
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="stack gap-1" style={{ marginTop: 4 }}>
                      <textarea className="input" rows={2} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                      <div className="row gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={!editDraft.trim() || editMutation.isPending}
                          onClick={() => editMutation.mutate(c.id)}
                        >
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: "2px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{c.body}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="row gap-2" style={{ alignItems: "flex-start", marginTop: 10 }}>
        <textarea
          className="input"
          rows={2}
          placeholder="Add a comment..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!draft.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          {addMutation.isPending ? "Posting..." : "Post"}
        </button>
      </div>

      {deleteId !== null && (
        <ConfirmDialog
          title="Delete Comment"
          message="This comment will be permanently deleted. This cannot be undone."
          danger
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
