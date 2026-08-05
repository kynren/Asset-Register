import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { FormModal } from "../../../components/FormModal";
import { FilterBar } from "../../../components/FilterBar";
import { PermissionGate } from "../../../auth/PermissionGate";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Skeleton } from "../../../components/Skeleton";
import { ChipSelect } from "../../../components/ChipSelect";
import { useAuth } from "../../../auth/AuthContext";
import { AccessGrant, AccessGrantPicker, AccessLevel, ManageAccessModal, canDeleteRecord, canEditRecord, canManageRecordAccess } from "../../../components/AccessControl";

type ProjectStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

interface ProjectAttachment {
  id: number;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  fileName: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedById: number;
  createdAt: string;
}

interface ProjectCard {
  id: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  assigneeId: number | null;
  assignee: { id: number; firstName: string; lastName: string } | null;
  startDate: string | null;
  dueDate: string | null;
  createdById: number;
  createdBy: { id: number; firstName: string; lastName: string };
  createdAt: string;
  access: AccessGrant[];
  attachments: ProjectAttachment[];
}

const STATUS_COLOR_ADMIN_ROLE_NAMES = ["System Admin", "Super Admin"];

const COLUMNS: { key: ProjectStatus; label: string }[] = [
  { key: "TODO", label: "Todo" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "REVIEW", label: "Review" },
  { key: "DONE", label: "Done" },
];

const DEFAULT_STATUS_COLORS: Record<ProjectStatus, string> = {
  TODO: "#64748b",
  IN_PROGRESS: "#2563eb",
  REVIEW: "#d97706",
  DONE: "#16a34a",
};

export function ProjectsTab() {
  const queryClient = useQueryClient();
  const { user, myTeamIds } = useAuth();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [showForm, setShowForm] = useState(false);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [managingAccessId, setManagingAccessId] = useState<number | null>(null);
  const [managingAttachmentsId, setManagingAttachmentsId] = useState<number | null>(null);
  const [customizingColors, setCustomizingColors] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["op-projects"],
    queryFn: async () => (await axiosClient.get("/operations/projects")).data as ProjectCard[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: teams } = useQuery({ queryKey: ["teams-directory"], queryFn: async () => (await axiosClient.get("/teams/directory")).data });
  const { data: statusColors } = useQuery({
    queryKey: ["op-project-status-colors"],
    queryFn: async () => (await axiosClient.get("/operations/projects/status-colors")).data as Record<ProjectStatus, string>,
  });
  const colors = statusColors ?? DEFAULT_STATUS_COLORS;

  const moveMutation = useMutation({
    mutationFn: (params: { id: number; status: ProjectStatus }) => axiosClient.patch(`/operations/projects/${params.id}/status`, { status: params.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-projects"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/projects/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-projects"] }); setDeletingId(null); },
  });

  const editingCard = editingCardId ? cards?.find((c) => c.id === editingCardId) ?? null : null;
  const deleting = deletingId ? cards?.find((c) => c.id === deletingId) ?? null : null;
  const managingAccess = managingAccessId ? cards?.find((c) => c.id === managingAccessId) ?? null : null;
  const managingAttachments = managingAttachmentsId ? cards?.find((c) => c.id === managingAttachmentsId) ?? null : null;

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (cards ?? []).filter((c) => {
      if (q && !c.title.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q)) return false;
      if (assigneeFilter && String(c.assigneeId ?? "") !== assigneeFilter) return false;
      if (mineOnly && user && c.createdById !== user.id && !c.access.some((a) => a.userId === user.id || (a.teamId != null && myTeamIds.includes(a.teamId))) && c.assigneeId !== user.id) return false;
      return true;
    });
  }, [cards, search, assigneeFilter, mineOnly, user, myTeamIds]);

  function cardsFor(status: ProjectStatus) {
    return filteredCards.filter((c) => c.status === status);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const card = cards?.find((c) => c.id === Number(active.id));
    const targetStatus = over.data.current?.status as ProjectStatus | undefined;
    if (!card || !targetStatus || card.status === targetStatus) return;
    moveMutation.mutate({ id: card.id, status: targetStatus });
  }

  const activeCard = activeId ? cards?.find((c) => c.id === activeId) ?? null : null;
  const canCustomizeColors = !!user && STATUS_COLOR_ADMIN_ROLE_NAMES.includes(user.roleName);

  return (
    <div>
      <div className="ot-body-header">
        <div className="ot-body-header-text">Track IT infrastructure projects from planning through delivery.</div>
        <div className="row gap-2">
          {canCustomizeColors && (
            <button className="btn btn-secondary" onClick={() => setCustomizingColors(true)}>
              <Icon name="wand" size={13} /> Customize Colors
            </button>
          )}
          <PermissionGate module="operations" action="create">
            <button className="ad-btn ad-btn-primary" onClick={() => setShowForm(true)}>
              <Icon name="plus" size={13} /> Slot IT Project
            </button>
          </PermissionGate>
        </div>
      </div>

      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search projects...">
        <ChipSelect
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          placeholder="Any assignee"
          style={{ minWidth: 160 }}
          options={[{ value: "", label: "Any assignee" }, ...(users ?? []).map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))]}
        />
        <label className="row gap-1" style={{ alignItems: "center", fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My projects only
        </label>
      </FilterBar>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="ot-board">
          {COLUMNS.map((col) => {
            const colCards = cardsFor(col.key);
            return (
              <ProjectColumn key={col.key} status={col.key} label={col.label} count={isLoading ? null : colCards.length} color={colors[col.key]}>
                {isLoading ? (
                  <div className="stack gap-2">
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                  </div>
                ) : colCards.length === 0 ? (
                  <div className="ot-column-empty">No cards</div>
                ) : (
                  colCards.map((card) => (
                    <ProjectCardView
                      key={card.id}
                      card={card}
                      color={colors[card.status]}
                      canEdit={!!user && canEditRecord(card.createdById, card.access, user.id, user.roleName, myTeamIds)}
                      canDelete={!!user && canDeleteRecord(card.createdById, card.access, user.id, user.roleName, myTeamIds)}
                      canManageAccess={!!user && canManageRecordAccess(card.createdById, user.id, user.roleName)}
                      onEdit={() => setEditingCardId(card.id)}
                      onDelete={() => setDeletingId(card.id)}
                      onManageAccess={() => setManagingAccessId(card.id)}
                      onManageAttachments={() => setManagingAttachmentsId(card.id)}
                    />
                  ))
                )}
              </ProjectColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeCard && (
            <div className="ot-card" style={{ cursor: "grabbing", borderLeft: `3px solid ${colors[activeCard.status]}` }}>
              <div className="ot-card-title">{activeCard.title}</div>
              {activeCard.description && <div className="ot-card-desc">{activeCard.description}</div>}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {(showForm || editingCard) && (
        <ProjectFormModal
          initial={editingCard}
          users={users ?? []}
          teams={teams ?? []}
          onClose={() => { setShowForm(false); setEditingCardId(null); }}
        />
      )}

      {managingAccess && (
        <ManageAccessModal
          title={managingAccess.title}
          apiBasePath={`/operations/projects/${managingAccess.id}`}
          access={managingAccess.access}
          createdById={managingAccess.createdById}
          users={users ?? []}
          teams={teams ?? []}
          queryKey={["op-projects"]}
          onClose={() => setManagingAccessId(null)}
        />
      )}

      {managingAttachments && (
        <AttachmentsModal
          card={managingAttachments}
          canEdit={!!user && canEditRecord(managingAttachments.createdById, managingAttachments.access, user.id, user.roleName, myTeamIds)}
          onClose={() => setManagingAttachmentsId(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete project card"
          message={`Are you sure you want to delete "${deleting.title}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeletingId(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}

      {customizingColors && <StatusColorsModal colors={colors} onClose={() => setCustomizingColors(false)} />}
    </div>
  );
}

function ProjectColumn({
  status,
  label,
  count,
  color,
  children,
}: {
  status: ProjectStatus;
  label: string;
  count: number | null;
  color: string;
  children: React.ReactNode;
}) {
  const droppable = useDroppable({ id: `column-${status}`, data: { status } });
  return (
    <div ref={droppable.setNodeRef} className="ot-column" style={{ background: droppable.isOver ? "var(--color-primary-soft)" : undefined, borderTop: `3px solid ${color}`, transition: "background 0.15s ease" }}>
      <div className="ot-column-header">
        <span className="row gap-1" style={{ alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
          {label.toUpperCase()}
        </span>
        <span className="ot-column-count">{count === null ? "—" : count}</span>
      </div>
      {children}
    </div>
  );
}

function ProjectCardView({
  card,
  color,
  canEdit,
  canDelete,
  canManageAccess,
  onEdit,
  onDelete,
  onManageAccess,
  onManageAttachments,
}: {
  card: ProjectCard;
  color: string;
  canEdit: boolean;
  canDelete: boolean;
  canManageAccess: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onManageAccess: () => void;
  onManageAttachments: () => void;
}) {
  const draggable = useDraggable({ id: String(card.id), disabled: !canEdit });
  const style = draggable.transform ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`, zIndex: 5 } : undefined;

  return (
    <div
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      className="ot-card"
      style={{ ...style, borderLeft: `3px solid ${color}`, cursor: canEdit ? "grab" : "default", opacity: draggable.isDragging ? 0.35 : 1 }}
    >
      <div className="ot-card-title">{card.title}</div>
      {card.description && <div className="ot-card-desc">{card.description}</div>}
      <div className="ot-card-footer">
        <span className="ot-card-assignee">
          <Icon name="profile" size={11} />
          {card.assignee ? card.assignee.firstName : "Unassigned"}
        </span>
        {card.dueDate && <span>Due: {dayjs(card.dueDate).format("YYYY-MM-DD")}</span>}
      </div>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
        Created by {card.createdBy.firstName} {card.createdBy.lastName}
      </div>
      <div className="row gap-2" style={{ marginTop: 6, flexWrap: "wrap" }}>
        <button className="btn btn-secondary btn-sm" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onManageAttachments(); }}>
          <Icon name="paperclip" size={11} /> {card.attachments.length}
        </button>
        {canManageAccess && (
          <button className="btn btn-secondary btn-sm" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onManageAccess(); }}>
            <Icon name="profile" size={11} /> Access ({card.access.length})
          </button>
        )}
      </div>
      {(canEdit || canDelete) && (
        <div className="ot-card-actions" style={{ marginTop: 6 }}>
          {canEdit && (
            <button className="ot-card-move-btn" title="Edit" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Icon name="edit" size={13} />
            </button>
          )}
          {canDelete && (
            <button className="ot-card-delete-btn" title="Delete card" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectFormModal({
  initial,
  users,
  teams,
  onClose,
}: {
  initial: ProjectCard | null;
  users: any[];
  teams: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ? String(initial.assigneeId) : "");
  const [startDate, setStartDate] = useState(initial?.startDate ? dayjs(initial.startDate).format("YYYY-MM-DD") : "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ? dayjs(initial.dueDate).format("YYYY-MM-DD") : "");
  // Creation-time access grants — only relevant when creating (the creator can always manage
  // access afterward for existing cards via the Manage Access modal instead).
  const [newAccess, setNewAccess] = useState<{ userId?: string; teamId?: string; level: AccessLevel }[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        description: description || undefined,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        startDate: startDate ? dayjs(startDate).toISOString() : null,
        dueDate: dueDate ? dayjs(dueDate).toISOString() : null,
        ...(initial ? {} : { access: newAccess.map((a) => (a.userId != null ? { userId: Number(a.userId), level: a.level } : { teamId: Number(a.teamId), level: a.level })) }),
      };
      return initial ? axiosClient.patch(`/operations/projects/${initial.id}`, payload) : axiosClient.post("/operations/projects", payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-projects"] }); onClose(); },
  });

  return (
    <FormModal title={initial ? "Edit IT Project" : "Slot IT Project"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!title.trim()}>
      <div className="field"><label>Title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Description</label><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="field">
        <label>Assignee</label>
        <ChipSelect
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder="Unassigned"
          options={[{ value: "", label: "Unassigned" }, ...users.map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))]}
        />
      </div>
      <div className="row gap-2">
        <div className="field" style={{ flex: 1 }}><label>Start Date</label><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="field" style={{ flex: 1 }}><label>Due Date</label><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>

      {!initial && <AccessGrantPicker users={users} teams={teams} value={newAccess} onChange={setNewAccess} />}
    </FormModal>
  );
}

function StatusColorsModal({ colors, onClose }: { colors: Record<ProjectStatus, string>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(colors);

  const mutation = useMutation({
    mutationFn: () => axiosClient.put("/operations/projects/status-colors", draft),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-project-status-colors"] }); onClose(); },
  });

  return (
    <FormModal title="Customize Status Colors" onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitLabel="Save">
      <p className="muted" style={{ fontSize: 12 }}>Visible to every user on the IT Projects board. Only a System Admin or Super Admin can change these.</p>
      <div className="stack gap-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13 }}>{col.label}</span>
            <input
              type="color"
              value={draft[col.key]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [col.key]: e.target.value }))}
              style={{ width: 44, height: 28, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }}
            />
          </div>
        ))}
      </div>
    </FormModal>
  );
}

const ATTACHMENT_ICON: Record<ProjectAttachment["kind"], string> = { IMAGE: "image", VIDEO: "video", AUDIO: "music", FILE: "file" };

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsModal({ card, canEdit, onClose }: { card: ProjectCard; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (fd: FormData) => axiosClient.post(`/operations/projects/${card.id}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-projects"] });
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: any) => setUploadError(err?.response?.data?.error ?? "Could not upload attachment."),
  });
  const removeMutation = useMutation({
    mutationFn: (attachmentId: number) => axiosClient.delete(`/operations/projects/${card.id}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-projects"] }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    uploadMutation.mutate(fd);
  }

  return (
    <FormModal title={`Attachments — ${card.title}`} onClose={onClose} hideFooter>
      {uploadError && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{uploadError}</div>}
      <div className="stack gap-2" style={{ marginBottom: 14 }}>
        {card.attachments.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No files attached yet.</div>}
        {card.attachments.map((a) => (
          <div key={a.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <a href={a.url} target="_blank" rel="noreferrer" className="row gap-2" style={{ alignItems: "center", flex: 1, minWidth: 0 }}>
              <Icon name={ATTACHMENT_ICON[a.kind]} size={14} />
              <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.fileName}</span>
              <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>{formatBytes(a.sizeBytes)}</span>
            </a>
            {canEdit && (
              <button className="btn btn-danger btn-sm btn-icon" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(a.id)}>
                <Icon name="trash" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Add image, video, audio, or file</label>
          <input ref={fileInputRef} className="input" type="file" onChange={handleFileChange} disabled={uploadMutation.isPending} />
        </div>
      )}
    </FormModal>
  );
}
