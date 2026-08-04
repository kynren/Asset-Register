import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import dayjs, { Dayjs } from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { FormModal } from "../../../components/FormModal";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { usePermission } from "../../../auth/PermissionGate";

interface Schedule {
  id: number;
  resourceName: string;
  role: string | null;
  groupLabel: string;
  title: string | null;
  color: string | null;
  scheduledBy: { id: number; firstName: string; lastName: string };
  startAt: string;
  endAt: string;
  notes: string | null;
  createdAt: string;
}

const TIME_SLOTS = [
  { startHour: 8, endHour: 10 },
  { startHour: 10, endHour: 12 },
  { startHour: 12, endHour: 14 },
  { startHour: 14, endHour: 16 },
  { startHour: 16, endHour: 18 },
  { startHour: 18, endHour: 20 },
];

function slotLabel(s: { startHour: number; endHour: number }) {
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${fmt(s.startHour)} - ${fmt(s.endHour)}`;
}

// Cycles through the app's own theme accent tokens rather than arbitrary hex, so a block's color
// still reads as distinct from its neighbors without introducing a color that isn't part of the
// app's actual palette (and so it re-themes correctly in dark mode instead of staying fixed).
const PALETTE = ["var(--color-primary)", "var(--color-success)", "var(--color-warning)", "var(--color-danger)"];
function colorForId(id: number) {
  return PALETTE[id % PALETTE.length];
}

const GROUP_SUGGESTIONS = ["Technicians & Crews", "Hardware & Equipment"];

export function ResourceSchedulingTab() {
  const queryClient = useQueryClient();
  const canEdit = usePermission("operations", "edit");
  const canCreate = usePermission("operations", "create");
  const canDelete = usePermission("operations", "delete");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [selectedDate, setSelectedDate] = useState<Dayjs>(() => dayjs().startOf("day"));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["op-scheduling"],
    queryFn: async () => (await axiosClient.get("/operations/scheduling")).data as Schedule[],
  });

  const createMutation = useMutation({
    mutationFn: (v: Record<string, unknown>) => axiosClient.post("/operations/scheduling", v),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-scheduling"] }); setAdding(false); setError(null); },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not create schedule block."),
  });

  const updateMutation = useMutation({
    mutationFn: (v: Record<string, unknown>) => axiosClient.patch(`/operations/scheduling/${editing!.id}`, v),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-scheduling"] }); setEditing(null); setError(null); },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not update schedule block."),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, ...v }: { id: number } & Record<string, unknown>) => axiosClient.patch(`/operations/scheduling/${id}`, v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-scheduling"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/scheduling/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-scheduling"] }); setDeleting(null); },
  });

  // The roster of resources shown as grid rows is derived from every booking ever made (not just
  // the selected day) — there's no separate Resource entity, so a technician/crew "exists" on the
  // roster from the first time they're scheduled, keeping today's empty columns visible instead of
  // the row disappearing entirely on days with no bookings.
  const roster = useMemo(() => {
    const byName = new Map<string, { resourceName: string; role: string | null; groupLabel: string }>();
    for (const s of [...(schedules ?? [])].sort((a, b) => dayjs(b.createdAt).diff(a.createdAt)))
      if (!byName.has(s.resourceName)) byName.set(s.resourceName, { resourceName: s.resourceName, role: s.role, groupLabel: s.groupLabel });
    return [...byName.values()];
  }, [schedules]);

  const groups = useMemo(() => {
    const order: string[] = [];
    for (const r of roster) if (!order.includes(r.groupLabel)) order.push(r.groupLabel);
    return order.map((label) => ({ label, resources: roster.filter((r) => r.groupLabel === label) }));
  }, [roster]);

  const dayBlocks = useMemo(
    () => (schedules ?? []).filter((s) => dayjs(s.startAt).isSame(selectedDate, "day")),
    [schedules, selectedDate]
  );

  function blockFor(resourceName: string, slot: { startHour: number; endHour: number }) {
    return dayBlocks.find((s) => s.resourceName === resourceName && dayjs(s.startAt).hour() >= slot.startHour && dayjs(s.startAt).hour() < slot.endHour);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const schedule = schedules?.find((s) => s.id === Number(active.id));
    const target = over.data.current as { resourceName: string; role: string | null; groupLabel: string; slot: { startHour: number; endHour: number } } | undefined;
    if (!schedule || !target) return;

    const startAt = selectedDate.hour(target.slot.startHour).minute(0).second(0);
    const endAt = selectedDate.hour(target.slot.endHour).minute(0).second(0);
    if (schedule.resourceName === target.resourceName && dayjs(schedule.startAt).isSame(startAt)) return;

    rescheduleMutation.mutate({
      id: schedule.id,
      resourceName: target.resourceName,
      role: target.role,
      groupLabel: target.groupLabel,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    });
  }

  const activeSchedule = activeId ? schedules?.find((s) => s.id === activeId) ?? null : null;

  return (
    <div>
      <div className="card" style={{ padding: "18px 20px 20px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", resize: "none" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Icon name="clock" size={16} style={{ color: "var(--color-primary)" }} />
              <strong style={{ fontSize: 13, letterSpacing: 1, color: "var(--color-primary)" }}>DISPATCH &amp; ALLOCATION GRID</strong>
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 0", maxWidth: 560 }}>
              Visual block-based technician shifts and hardware reservation coordinator. <strong style={{ color: "var(--color-text)" }}>Drag &amp; drop</strong> blocks
              horizontally or vertically to reschedule instantly.
            </p>
          </div>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <button className="btn-icon" onClick={() => setSelectedDate((d) => d.subtract(1, "day"))} title="Previous day">
              <Icon name="chevronLeft" size={14} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedDate(dayjs().startOf("day"))} style={{ fontSize: 11 }}>
              {selectedDate.format("DD MMM YYYY")}
            </button>
            <button className="btn-icon" onClick={() => setSelectedDate((d) => d.add(1, "day"))} title="Next day">
              <Icon name="chevronRight" size={14} />
            </button>
            {canCreate && (
              <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)} style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginLeft: 4 }}>
                <Icon name="plus" size={13} /> SCHEDULE BLOCK
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="muted" style={{ fontSize: 12, padding: "20px 0" }}>Loading dispatch grid...</div>
        ) : roster.length === 0 ? (
          <div className="muted" style={{ fontSize: 12, padding: "20px 0", textAlign: "center" }}>
            No resources scheduled yet. Add the first schedule block to build the roster.
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 880 }}>
                <div style={{ display: "grid", gridTemplateColumns: "200px repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
                  <div className="muted" style={{ fontSize: 10, letterSpacing: 0.5, alignSelf: "center" }}>RESOURCE / CREW</div>
                  {TIME_SLOTS.map((slot) => (
                    <div
                      key={slot.startHour}
                      className="muted"
                      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 4px", textAlign: "center", fontSize: 10.5, fontWeight: 700 }}
                    >
                      {slotLabel(slot)}
                    </div>
                  ))}
                </div>

                {groups.map((group) => (
                  <div key={group.label}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-primary)", margin: "10px 0 6px" }}>{group.label.toUpperCase()}</div>
                    {group.resources.map((r) => (
                      <div key={r.resourceName} style={{ display: "grid", gridTemplateColumns: "200px repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
                        <div style={{ alignSelf: "center" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text)" }}>{r.resourceName}</div>
                          {r.role && <div className="muted" style={{ fontSize: 10.5 }}>{r.role}</div>}
                        </div>
                        {TIME_SLOTS.map((slot) => {
                          const block = blockFor(r.resourceName, slot);
                          return (
                            <GridCell
                              key={slot.startHour}
                              resource={r}
                              slot={slot}
                              block={block}
                              canEdit={canEdit}
                              canDelete={canDelete}
                              onEdit={() => block && setEditing(block)}
                              onDelete={() => block && setDeleting(block)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <DragOverlay>
              {activeSchedule && (
                <div style={{ background: activeSchedule.color ?? colorForId(activeSchedule.id), borderRadius: 8, padding: "8px 10px", width: 150, boxShadow: "var(--shadow-md)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{activeSchedule.title || "Shift"}</div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {adding && (
        <ScheduleBlockModal
          defaultDate={selectedDate}
          resourceSuggestions={[...new Set(roster.map((r) => r.resourceName))]}
          roleSuggestions={[...new Set(roster.map((r) => r.role).filter((v): v is string => !!v))]}
          error={error}
          submitting={createMutation.isPending}
          onClose={() => { setAdding(false); setError(null); }}
          onSubmit={(v) => createMutation.mutate(v)}
        />
      )}

      {editing && (
        <ScheduleBlockModal
          defaultDate={dayjs(editing.startAt)}
          initial={editing}
          resourceSuggestions={[...new Set(roster.map((r) => r.resourceName))]}
          roleSuggestions={[...new Set(roster.map((r) => r.role).filter((v): v is string => !!v))]}
          error={error}
          submitting={updateMutation.isPending}
          onClose={() => { setEditing(null); setError(null); }}
          onSubmit={(v) => updateMutation.mutate(v)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Remove schedule block"
          message={`Remove "${deleting.title || deleting.resourceName}" from the dispatch grid? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function GridCell({
  resource,
  slot,
  block,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  resource: { resourceName: string; role: string | null; groupLabel: string };
  slot: { startHour: number; endHour: number };
  block: Schedule | undefined;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const droppable = useDroppable({
    id: `cell-${resource.resourceName}-${slot.startHour}`,
    data: { resourceName: resource.resourceName, role: resource.role, groupLabel: resource.groupLabel, slot },
    disabled: !!block || !canEdit,
  });
  const draggable = useDraggable({ id: String(block?.id ?? `empty-${resource.resourceName}-${slot.startHour}`), disabled: !block || !canEdit });

  if (!block) {
    return (
      <div
        ref={droppable.setNodeRef}
        style={{
          border: `1px dashed ${droppable.isOver ? "var(--color-primary)" : "var(--color-border)"}`,
          borderRadius: 8,
          minHeight: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: droppable.isOver ? "var(--color-primary-soft)" : "transparent",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        <span className="muted" style={{ fontSize: 10.5 }}>Empty</span>
      </div>
    );
  }

  const color = block.color ?? colorForId(block.id);
  const style = draggable.transform ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`, zIndex: 5 } : undefined;

  return (
    <div
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      style={{
        ...style,
        background: color,
        borderRadius: 8,
        padding: "8px 9px 7px",
        minHeight: 54,
        cursor: canEdit ? "grab" : "default",
        opacity: draggable.isDragging ? 0.35 : 1,
        boxShadow: "var(--shadow-sm)",
      }}
      title={block.notes ?? undefined}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>{block.title || "Shift"}</div>
        <div className="row gap-1" style={{ flexShrink: 0 }}>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 13 }}
              title="Edit"
            >
              <Icon name="edit" size={11} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 13 }}
              title="Remove"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      </div>
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, background: "rgba(255,255,255,0.16)",
          borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: 0.5,
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} /> SHIFT
      </span>
    </div>
  );
}

function ScheduleBlockModal({
  defaultDate,
  initial,
  resourceSuggestions,
  roleSuggestions,
  error,
  submitting,
  onClose,
  onSubmit,
}: {
  defaultDate: Dayjs;
  initial?: Schedule;
  resourceSuggestions: string[];
  roleSuggestions: string[];
  error: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const [resourceName, setResourceName] = useState(initial?.resourceName ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [groupLabel, setGroupLabel] = useState(initial?.groupLabel ?? GROUP_SUGGESTIONS[0]);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(defaultDate.format("YYYY-MM-DD"));
  const [slotIndex, setSlotIndex] = useState(() => {
    if (!initial) return 0;
    const hour = dayjs(initial.startAt).hour();
    const idx = TIME_SLOTS.findIndex((s) => hour >= s.startHour && hour < s.endHour);
    return idx === -1 ? 0 : idx;
  });
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const slot = TIME_SLOTS[slotIndex];
  const valid = resourceName.trim().length > 0 && title.trim().length > 0;

  function handleSubmit() {
    const startAt = dayjs(date).hour(slot.startHour).minute(0).second(0);
    const endAt = dayjs(date).hour(slot.endHour).minute(0).second(0);
    onSubmit({
      resourceName: resourceName.trim(),
      role: role.trim() || undefined,
      groupLabel,
      title: title.trim(),
      notes: notes.trim() || undefined,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    });
  }

  return (
    <FormModal title={initial ? "Edit Schedule Block" : "Schedule a Block"} onClose={onClose} onSubmit={handleSubmit} submitting={submitting} submitDisabled={!valid} submitLabel={initial ? "Save" : "Schedule"}>
      {error && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="field">
        <label>Resource / Crew *</label>
        <input className="input" list="resource-suggestions" placeholder="e.g. Alice Smith" value={resourceName} onChange={(e) => setResourceName(e.target.value)} />
        <datalist id="resource-suggestions">{resourceSuggestions.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
      <div className="row gap-2">
        <div className="field" style={{ flex: 1 }}>
          <label>Role</label>
          <input className="input" list="role-suggestions" placeholder="e.g. Lead Stage Tech" value={role} onChange={(e) => setRole(e.target.value)} />
          <datalist id="role-suggestions">{roleSuggestions.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Group</label>
          <input className="input" list="group-suggestions" value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} />
          <datalist id="group-suggestions">{GROUP_SUGGESTIONS.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
      </div>
      <div className="field">
        <label>Block Title *</label>
        <input className="input" placeholder="e.g. Lake Projector Calibration" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="row gap-2">
        <div className="field" style={{ flex: 1 }}>
          <label>Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Time Slot</label>
          <select className="select" value={slotIndex} onChange={(e) => setSlotIndex(Number(e.target.value))}>
            {TIME_SLOTS.map((s, i) => <option key={s.startHour} value={i}>{slotLabel(s)}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <input className="input" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </FormModal>
  );
}
