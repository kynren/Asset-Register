import { FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { PermissionGate, usePermission } from "../../auth/PermissionGate";
import { useAuth } from "../../auth/AuthContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { QrCodeModal } from "../../components/QrCodeModal";
import { ChipSelect } from "../../components/ChipSelect";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { TicketTasksTab } from "./TicketTasksTab";
import { TicketSolutionTab } from "./TicketSolutionTab";
import { TicketApprovalsTab } from "./TicketApprovalsTab";
import { TicketLinksTab } from "./TicketLinksTab";
import { TicketKnowledgeTab } from "./TicketKnowledgeTab";

const STATUS_FLOW = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const TABS = ["overview", "tasks", "solution", "approvals", "links", "knowledge"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  tasks: "Tasks",
  solution: "Solution",
  approvals: "Approvals",
  links: "Links",
  knowledge: "Knowledge Base",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toggleId(set: Set<number>, setSet: (s: Set<number>) => void, id: number) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSet(next);
}

export function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = usePermission("helpdesk", "edit");
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const [deletingAttachment, setDeletingAttachment] = useState<{ id: number; filename: string } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(new Set());
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<Tab>("overview");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await axiosClient.get(`/tickets/${id}`)).data,
  });

  const { data: users } = useQuery({
    queryKey: ["users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data,
    enabled: isStaff,
  });
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await axiosClient.get("/teams")).data,
    enabled: isStaff,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", id] });

  const statusMutation = useMutation({
    mutationFn: (status: string) => axiosClient.patch(`/tickets/${id}/status`, { status }),
    meta: { successMessage: "Ticket status updated" },
    onSuccess: invalidate,
  });

  const assignmentMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/tickets/${id}`, { assigneeIds: [...assigneeIds], assignedTeamIds: [...assignedTeamIds] }),
    meta: { successMessage: "Assignment updated" },
    onSuccess: () => { invalidate(); setEditingAssignment(false); },
  });

  function startEditingAssignment() {
    setAssigneeIds(new Set((ticket?.assignees ?? []).map((a: any) => a.user.id)));
    setAssignedTeamIds(new Set((ticket?.assignedTeams ?? []).map((t: any) => t.team.id)));
    setEditingAssignment(true);
  }

  const commentMutation = useMutation({
    mutationFn: (body: { body: string; isInternal: boolean }) => axiosClient.post(`/tickets/${id}/comments`, body),
    meta: { successMessage: "Comment added" },
    onSuccess: () => {
      invalidate();
      setComment("");
      setIsInternal(false);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, commentId }: { file: File; commentId?: number }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (commentId) formData.append("commentId", String(commentId));
      return axiosClient.post(`/tickets/${id}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: invalidate,
  });

  const watchMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${id}/watch`),
    onSuccess: invalidate,
  });

  const satisfactionMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${id}/satisfaction`, { rating: ratingValue, comment: ratingComment || undefined }),
    onSuccess: invalidate,
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => axiosClient.delete(`/tickets/${id}/attachments/${attachmentId}`),
    onSuccess: () => { invalidate(); setDeletingAttachment(null); },
  });

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    const fileToAttach = commentFile;
    setCommentFile(null);
    if (commentFileInputRef.current) commentFileInputRef.current.value = "";
    const res = await commentMutation.mutateAsync({ body: comment, isInternal });
    if (fileToAttach) {
      await uploadMutation.mutateAsync({ file: fileToAttach, commentId: res.data.id });
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate({ file });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCommentFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCommentFile(e.target.files?.[0] ?? null);
  }

  async function downloadAttachment(attachmentId: number, filename: string) {
    const res = await axiosClient.get(`/tickets/${id}/attachments/${attachmentId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  function renderAttachmentRow(a: any) {
    return (
      <div key={a.id} className="row gap-2" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
        <span className="row gap-1" style={{ fontSize: 13, cursor: "pointer", color: "var(--color-primary)" }} onClick={() => downloadAttachment(a.id, a.filename)}>
          <Icon name="paperclip" size={13} /> {a.filename} <span className="muted">({formatBytes(a.sizeBytes)})</span>
        </span>
        <PermissionGate module="helpdesk" action="edit">
          <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletingAttachment({ id: a.id, filename: a.filename })}><Icon name="trash" size={12} /></button>
        </PermissionGate>
      </div>
    );
  }

  if (isLoading || !ticket) {
    return (
      <div className="stack gap-3">
        <Skeleton height={60} />
        <div className="grid grid-cols-2" style={{ gap: 14 }}>
          <div className="card"><SkeletonText lines={5} /></div>
          <div className="card"><SkeletonText lines={4} /></div>
        </div>
      </div>
    );
  }

  const isOverdue = ticket.dueAt && dayjs(ticket.dueAt).isBefore(dayjs()) && !["RESOLVED", "CLOSED"].includes(ticket.status);
  const canRate = user?.id === ticket.requesterId && ["RESOLVED", "CLOSED"].includes(ticket.status) && !ticket.satisfactionRating;

  return (
    <div className="stack gap-3">
      <button className="btn btn-secondary btn-sm" style={{ width: "fit-content" }} onClick={() => navigate("/helpdesk")}>
        <Icon name="chevronLeft" size={14} /> Back to Helpdesk
      </button>

      <div className="page-header">
        <div>
          <h1 className="page-title">{ticket.ticketNumber} — {ticket.title}</h1>
          <p className="page-subtitle">
            Raised by {ticket.requester.firstName} {ticket.requester.lastName} on {dayjs(ticket.createdAt).format("DD MMM YYYY")}
            {ticket.category && ` · ${ticket.category.name}`}
          </p>
        </div>
        <div className="row gap-2">
          {isOverdue && <span className="badge badge-danger">OVERDUE</span>}
          <StatusBadge status={ticket.itilType} />
          <StatusBadge status={ticket.type} />
          <StatusBadge status={ticket.priority} />
          <StatusBadge status={ticket.status} />
          <button className={`btn btn-sm ${ticket.isWatching ? "btn-primary" : "btn-secondary"}`} onClick={() => watchMutation.mutate()}>
            <Icon name="bell" size={13} /> {ticket.isWatching ? "Watching" : "Watch"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowQr(true)}>
            <Icon name="grid" size={13} /> QR Code
          </button>
        </div>
      </div>

      <div className="row gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "overview" && (
      <>
      <div className="grid grid-cols-2">
        <div className="card">
          <h3 className="mt-0">Description</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
          {ticket.asset && (
            <p className="muted">Related asset: <a onClick={() => navigate(`/assets/${ticket.asset.id}`)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>{ticket.asset.assetTag} — {ticket.asset.name}</a></p>
          )}
          {ticket.location && <p className="muted">Location: {ticket.location.name}</p>}
          {ticket.dueAt && (
            <p className="muted">Due: <span style={{ color: isOverdue ? "var(--color-danger)" : undefined, fontWeight: isOverdue ? 600 : undefined }}>{dayjs(ticket.dueAt).format("DD MMM YYYY, HH:mm")}</span></p>
          )}
        </div>

        <div className="card">
          <h3 className="mt-0">Status</h3>
          <PermissionGate module="helpdesk" action="edit" fallback={<StatusBadge status={ticket.status} />}>
            <ChipSelect
              style={{ width: "auto", minWidth: 160 }}
              value={ticket.status}
              disabled={statusMutation.isPending}
              onChange={(s) => statusMutation.mutate(s)}
              options={STATUS_FLOW.map((s) => ({ value: s, label: s.replace("_", " ") }))}
            />
          </PermissionGate>
          <div style={{ marginTop: 12 }}>
            {editingAssignment ? (
              <div className="stack gap-2">
                <div className="field">
                  <label>Assignees ({assigneeIds.size} selected)</label>
                  <div className="stack gap-1" style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                    {users?.map((u: any) => (
                      <label key={u.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={assigneeIds.has(u.id)} onChange={() => toggleId(assigneeIds, setAssigneeIds, u.id)} />
                        {u.firstName} {u.lastName}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Teams ({assignedTeamIds.size} selected)</label>
                  <div className="stack gap-1" style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                    {teams?.length ? teams.map((t: any) => (
                      <label key={t.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={assignedTeamIds.has(t.id)} onChange={() => toggleId(assignedTeamIds, setAssignedTeamIds, t.id)} />
                        {t.name}
                      </label>
                    )) : <span className="muted" style={{ fontSize: 12 }}>No teams yet.</span>}
                  </div>
                </div>
                <div className="row gap-2">
                  <button className="btn btn-primary btn-sm" disabled={assignmentMutation.isPending} onClick={() => assignmentMutation.mutate()}>
                    {assignmentMutation.isPending ? "Saving..." : "Save Assignment"}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingAssignment(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <p className="muted">
                  Assignees: {ticket.assignees?.length ? ticket.assignees.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join(", ") : "Unassigned"}
                </p>
                <p className="muted">
                  Teams: {ticket.assignedTeams?.length ? ticket.assignedTeams.map((t: any) => t.team.name).join(", ") : "No team"}
                </p>
                <PermissionGate module="helpdesk" action="edit">
                  <button className="btn btn-secondary btn-sm" onClick={startEditingAssignment}>
                    <Icon name="edit" size={12} /> Edit Assignment
                  </button>
                </PermissionGate>
              </>
            )}
          </div>
          {ticket.satisfactionRating && (
            <p className="muted">
              Satisfaction: {"★".repeat(ticket.satisfactionRating)}{"☆".repeat(5 - ticket.satisfactionRating)}
              {ticket.satisfactionComment && ` — "${ticket.satisfactionComment}"`}
            </p>
          )}
        </div>
      </div>

      {canRate && (
        <div className="card">
          <h3 className="mt-0">Rate this resolution</h3>
          <div className="row gap-1" style={{ marginBottom: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="btn btn-icon" style={{ background: "none", border: "none", cursor: "pointer", color: n <= ratingValue ? "var(--color-warning)" : "var(--color-border)" }} onClick={() => setRatingValue(n)}>
                <Icon name="star" size={22} />
              </button>
            ))}
          </div>
          <input className="input" placeholder="Optional feedback..." value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} style={{ marginBottom: 10 }} />
          <button className="btn btn-primary btn-sm" onClick={() => satisfactionMutation.mutate()} disabled={satisfactionMutation.isPending}>Submit Rating</button>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="mt-0">Attachments</h3>
          <PermissionGate module="helpdesk" action="edit">
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileChange} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
              <Icon name="paperclip" size={13} /> {uploadMutation.isPending ? "Uploading..." : "Attach File"}
            </button>
          </PermissionGate>
        </div>
        {(() => {
          const ticketLevelAttachments = (ticket.attachments ?? []).filter((a: any) => !a.commentId);
          return ticketLevelAttachments.length ? (
            <div className="stack gap-1">{ticketLevelAttachments.map(renderAttachmentRow)}</div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>No attachments yet.</div>
          );
        })()}
      </div>

      <div className="card">
        <h3 className="mt-0">Comments</h3>
        <div className="stack gap-2" style={{ marginBottom: 16 }}>
          {ticket.comments.length === 0 && <div className="muted">No comments yet.</div>}
          {ticket.comments.map((c: any) => (
            <div
              key={c.id}
              style={{
                borderBottom: "1px solid var(--color-border)",
                paddingBottom: 8,
                background: c.isInternal ? "var(--color-warning-soft)" : undefined,
                padding: c.isInternal ? 8 : undefined,
                borderRadius: c.isInternal ? 6 : undefined,
              }}
            >
              <div className="row gap-2" style={{ fontSize: 12 }}>
                <strong>{c.author.firstName} {c.author.lastName}</strong>
                <span className="muted">{dayjs(c.createdAt).format("DD MMM YYYY, HH:mm")}</span>
                {c.isInternal && <span className="badge badge-warning">Internal Note</span>}
              </div>
              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{c.body}</p>
              {(ticket.attachments ?? []).filter((a: any) => a.commentId === c.id).length > 0 && (
                <div className="stack gap-1" style={{ marginTop: 6 }}>
                  {(ticket.attachments ?? []).filter((a: any) => a.commentId === c.id).map(renderAttachmentRow)}
                </div>
              )}
            </div>
          ))}
        </div>
        <PermissionGate module="helpdesk" action="edit">
          <form className="stack gap-2" onSubmit={handleAddComment}>
            <input className="input" placeholder="Add a comment..." value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                {isStaff && (
                  <label className="row gap-1" style={{ fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                    Internal note (staff only)
                  </label>
                )}
                <input ref={commentFileInputRef} type="file" style={{ display: "none" }} onChange={handleCommentFileChange} />
                <button type="button" className="btn btn-secondary btn-sm btn-icon" title="Attach a file to this comment" onClick={() => commentFileInputRef.current?.click()}>
                  <Icon name="paperclip" size={13} />
                </button>
                {commentFile && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {commentFile.name}
                    <button type="button" className="btn btn-secondary btn-sm btn-icon" style={{ marginLeft: 4 }} onClick={() => { setCommentFile(null); if (commentFileInputRef.current) commentFileInputRef.current.value = ""; }}>
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                )}
              </div>
              <button className="btn btn-primary" type="submit" disabled={commentMutation.isPending || uploadMutation.isPending}>Post</button>
            </div>
          </form>
        </PermissionGate>
      </div>
      </>
      )}

      {tab === "tasks" && (
        <TicketTasksTab ticketId={ticket.id} tasks={ticket.tasks ?? []} users={users ?? []} currentUserId={user!.id} />
      )}

      {tab === "solution" && (
        <TicketSolutionTab ticketId={ticket.id} solutions={ticket.solutions ?? []} isRequester={user?.id === ticket.requesterId} />
      )}

      {tab === "approvals" && (
        <TicketApprovalsTab ticketId={ticket.id} approvals={ticket.approvals ?? []} users={users ?? []} teams={teams ?? []} currentUserId={user!.id} />
      )}

      {tab === "links" && (
        <TicketLinksTab ticketId={ticket.id} linksFrom={ticket.linksFrom ?? []} linksTo={ticket.linksTo ?? []} />
      )}

      {tab === "knowledge" && (
        <TicketKnowledgeTab ticketId={ticket.id} knowledgeArticles={ticket.knowledgeArticles ?? []} />
      )}

      {deletingAttachment && (
        <ConfirmDialog
          title="Delete attachment"
          message={`Are you sure you want to delete "${deletingAttachment.filename}"? This cannot be undone.`}
          danger
          loading={deleteAttachmentMutation.isPending}
          onCancel={() => setDeletingAttachment(null)}
          onConfirm={() => deleteAttachmentMutation.mutate(deletingAttachment.id)}
        />
      )}

      {showQr && (
        <QrCodeModal
          title="Ticket QR Code"
          value={`${window.location.origin}/helpdesk/${ticket.id}`}
          label={ticket.ticketNumber}
          subLabel={ticket.title}
          onClose={() => setShowQr(false)}
        />
      )}
    </div>
  );
}
