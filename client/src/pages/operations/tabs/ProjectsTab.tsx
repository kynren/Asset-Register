import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { FormModal } from "../../../components/FormModal";
import { PermissionGate } from "../../../auth/PermissionGate";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Skeleton } from "../../../components/Skeleton";

interface ProjectCard {
  id: number;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  assigneeId: number | null;
  assignee: { id: number; firstName: string; lastName: string } | null;
  dueDate: string | null;
  createdAt: string;
}

const COLUMNS: { key: ProjectCard["status"]; label: string }[] = [
  { key: "TODO", label: "Todo" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "REVIEW", label: "Review" },
  { key: "DONE", label: "Done" },
];

export function ProjectsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [deleting, setDeleting] = useState<ProjectCard | null>(null);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["op-projects"],
    queryFn: async () => (await axiosClient.get("/operations/projects")).data as ProjectCard[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/operations/projects", {
        title,
        description: description || undefined,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-projects"] });
      setShowForm(false);
      setTitle("");
      setDescription("");
      setAssigneeId("");
      setDueDate("");
    },
  });

  const moveMutation = useMutation({
    mutationFn: (params: { id: number; status: ProjectCard["status"] }) => axiosClient.patch(`/operations/projects/${params.id}/status`, { status: params.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-projects"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/projects/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-projects"] }); setDeleting(null); },
  });

  function cardsFor(status: ProjectCard["status"]) {
    return cards?.filter((c) => c.status === status) ?? [];
  }

  return (
    <div>
      <div className="ot-body-header">
        <div className="ot-body-header-text">Track IT infrastructure projects from planning through delivery.</div>
        <PermissionGate module="operations" action="create">
          <button className="ad-btn ad-btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={13} /> Slot IT Project
          </button>
        </PermissionGate>
      </div>

      <div className="ot-board">
        {COLUMNS.map((col, colIndex) => {
          const colCards = cardsFor(col.key);
          return (
            <div key={col.key} className="ot-column">
              <div className="ot-column-header">
                {col.label.toUpperCase()}
                <span className="ot-column-count">{isLoading ? "—" : colCards.length}</span>
              </div>
              {isLoading ? (
                <div className="stack gap-2">
                  <Skeleton height={64} />
                  <Skeleton height={64} />
                </div>
              ) : colCards.length === 0 ? (
                <div className="ot-column-empty">No cards</div>
              ) : (
                colCards.map((card) => (
                  <div key={card.id} className="ot-card">
                    <div className="ot-card-title">{card.title}</div>
                    {card.description && <div className="ot-card-desc">{card.description}</div>}
                    <div className="ot-card-footer">
                      <span className="ot-card-assignee">
                        <Icon name="profile" size={11} />
                        {card.assignee ? card.assignee.firstName : "Unassigned"}
                      </span>
                      {card.dueDate && <span>Due: {dayjs(card.dueDate).format("YYYY-MM-DD")}</span>}
                    </div>
                    <PermissionGate module="operations" action="edit">
                      <div className="ot-card-actions">
                        <button
                          className="ot-card-move-btn"
                          disabled={colIndex === 0 || moveMutation.isPending}
                          title={`Move to ${COLUMNS[colIndex - 1]?.label}`}
                          onClick={() => moveMutation.mutate({ id: card.id, status: COLUMNS[colIndex - 1].key })}
                        >
                          <Icon name="chevronLeft" size={13} />
                        </button>
                        <button
                          className="ot-card-move-btn"
                          disabled={colIndex === COLUMNS.length - 1 || moveMutation.isPending}
                          title={`Move to ${COLUMNS[colIndex + 1]?.label}`}
                          onClick={() => moveMutation.mutate({ id: card.id, status: COLUMNS[colIndex + 1].key })}
                        >
                          <Icon name="chevronRight" size={13} />
                        </button>
                        <PermissionGate module="operations" action="delete">
                          <button className="ot-card-delete-btn" title="Delete card" onClick={() => setDeleting(card)}>
                            <Icon name="trash" size={13} />
                          </button>
                        </PermissionGate>
                      </div>
                    </PermissionGate>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <FormModal
          title="Slot IT Project"
          onClose={() => setShowForm(false)}
          onSubmit={() => createMutation.mutate()}
          submitting={createMutation.isPending}
        >
          <div className="field"><label>Title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label>Description</label><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="field">
            <label>Assignee</label>
            <select className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="field"><label>Due Date</label><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </FormModal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete project card"
          message={`Are you sure you want to delete "${deleting.title}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
