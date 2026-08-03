import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";

function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function TicketTasksTab({ ticketId, tasks, users, currentUserId }: { ticketId: number; tasks: any[]; users: any[]; currentUserId: number }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [minutes, setMinutes] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; content: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/tickets/${ticketId}/tasks`, {
        content,
        category: category || undefined,
        actionTimeSeconds: minutes ? Number(minutes) * 60 : undefined,
        assignedToId: assignedToId ? Number(assignedToId) : undefined,
        isPrivate,
      }),
    meta: { successMessage: "Task added" },
    onSuccess: () => {
      invalidate();
      setContent("");
      setCategory("");
      setMinutes("");
      setAssignedToId("");
      setIsPrivate(false);
    },
  });

  const toggleStateMutation = useMutation({
    mutationFn: ({ taskId, state }: { taskId: number; state: string }) => axiosClient.patch(`/tickets/${ticketId}/tasks/${taskId}`, { state }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) => axiosClient.delete(`/tickets/${ticketId}/tasks/${taskId}`),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  const visibleTasks = (tasks ?? []).filter((t) => !t.isPrivate || t.authorId === currentUserId);

  return (
    <div className="card">
      <h3 className="mt-0">Tasks & Time Tracking</h3>
      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {visibleTasks.length === 0 && <div className="muted">No tasks logged yet.</div>}
        {visibleTasks.map((t) => (
          <div key={t.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div>
              <div className="row gap-2" style={{ alignItems: "center", fontSize: 12 }}>
                <StatusBadge status={t.state} />
                {t.category && <span className="muted">{t.category}</span>}
                {t.isPrivate && <Icon name="eyeOff" size={12} />}
                <span className="muted">{dayjs(t.createdAt).format("DD MMM YYYY, HH:mm")}</span>
              </div>
              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{t.content}</p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                {t.author && `${t.author.firstName} ${t.author.lastName}`}
                {t.assignedTo && ` · Assigned to ${t.assignedTo.firstName} ${t.assignedTo.lastName}`}
                {formatDuration(t.actionTimeSeconds) && ` · ${formatDuration(t.actionTimeSeconds)}`}
              </p>
            </div>
            <div className="row gap-1">
              <PermissionGate module="helpdesk" action="edit">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleStateMutation.mutate({ taskId: t.id, state: t.state === "DONE" ? "TODO" : "DONE" })}
                >
                  {t.state === "DONE" ? "Reopen" : "Mark Done"}
                </button>
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting({ id: t.id, content: t.content })}>
                  <Icon name="trash" size={12} />
                </button>
              </PermissionGate>
            </div>
          </div>
        ))}
      </div>

      <PermissionGate module="helpdesk" action="edit">
        <div className="stack gap-2">
          <textarea className="input" rows={2} placeholder="Describe the work done or planned..." value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="row gap-2 flex-wrap">
            <input className="input" style={{ maxWidth: 160 }} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input className="input" type="number" min={0} style={{ maxWidth: 120 }} placeholder="Minutes spent" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            <select className="input" style={{ maxWidth: 200 }} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Assign to...</option>
              {users?.map((u: any) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
            <label className="row gap-1" style={{ fontSize: 12, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private (staff only)
            </label>
            <button className="btn btn-primary btn-sm" disabled={!content.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              Log Task
            </button>
          </div>
        </div>
      </PermissionGate>

      {deleting && (
        <ConfirmDialog
          title="Delete task"
          message={`Are you sure you want to delete this task? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
