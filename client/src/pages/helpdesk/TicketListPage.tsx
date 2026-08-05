import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { PermissionGate, usePermission } from "../../auth/PermissionGate";
import { Skeleton } from "../../components/Skeleton";
import { TicketFormModal, TicketFormValues } from "./TicketFormModal";
import { TicketApprovalsModal } from "./TicketApprovalsModal";
import { ModuleDashboardTab } from "../dashboard/ModuleDashboardTab";
import { HELPDESK_WIDGET_CATALOG, DEFAULT_HELPDESK_DASHBOARD_LAYOUT } from "./helpdeskDashboardWidgets";
import { ChipSelect } from "../../components/ChipSelect";
import { SavedViewBar } from "../../components/savedViews/SavedViewBar";
import dayjs from "dayjs";

const STATUS_OPTIONS = ["", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
const TYPE_OPTIONS = ["", "ACTION", "INFORMATION"];
const ITIL_TYPE_OPTIONS = ["", "INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];

type TicketStatus = "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";

const KANBAN_COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: "OPEN", label: "Open", color: "var(--color-primary)" },
  { key: "IN_PROGRESS", label: "In Progress", color: "var(--color-warning)" },
  { key: "PENDING", label: "Pending", color: "var(--color-warning)" },
  { key: "RESOLVED", label: "Resolved", color: "var(--color-success)" },
  { key: "CLOSED", label: "Closed", color: "var(--color-text-muted)" },
];

export function TicketListPage() {
  const [view, setView] = useState<"tickets" | "dashboard" | "kanban">("dashboard");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [itilType, setItilType] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = usePermission("helpdesk", "edit");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // Lets the command palette's "New Ticket" quick action deep-link straight into the create form.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowForm(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["tickets", { status, type, itilType, assignedToMe, overdue, search, page }],
    queryFn: async () =>
      (
        await axiosClient.get("/tickets", {
          params: { status: status || undefined, type: type || undefined, itilType: itilType || undefined, assignedToMe: assignedToMe || undefined, overdue: overdue || undefined, search: search || undefined, page, pageSize: 15 },
        })
      ).data,
  });

  const { data: approvals } = useQuery({
    queryKey: ["ticket-approvals-mine"],
    queryFn: async () => (await axiosClient.get("/tickets/approvals")).data as { needsApproval: any[]; sentByMe: any[] },
  });

  // Kanban needs every matching ticket bucketed by status at once, not one server page — reuses
  // the same filters (minus status, which becomes the column axis) at the app's global pagination
  // ceiling (see server/src/lib/pagination.ts) rather than a dedicated unpaginated endpoint.
  const { data: kanbanData, isLoading: kanbanLoading } = useQuery({
    queryKey: ["tickets-kanban", { type, itilType, assignedToMe, overdue, search }],
    queryFn: async () =>
      (
        await axiosClient.get("/tickets", {
          params: { type: type || undefined, itilType: itilType || undefined, assignedToMe: assignedToMe || undefined, overdue: overdue || undefined, search: search || undefined, page: 1, pageSize: 100 },
        })
      ).data,
    enabled: view === "kanban",
  });

  const statusMutation = useMutation({
    mutationFn: (params: { id: number; status: TicketStatus }) => axiosClient.patch(`/tickets/${params.id}/status`, { status: params.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets-kanban"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: TicketFormValues) => axiosClient.post("/tickets", values),
    meta: { successMessage: "Ticket created" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setShowForm(false);
    },
  });

  const columns: ColumnDef<any, any>[] = [
    { header: "Ticket #", accessorKey: "ticketNumber" },
    { header: "Title", accessorKey: "title" },
    { header: "ITIL Type", accessorKey: "itilType", cell: (info) => <StatusBadge status={info.getValue()} /> },
    { header: "Type", accessorKey: "type", cell: (info) => <StatusBadge status={info.getValue()} /> },
    { header: "Category", accessorFn: (row) => row.category?.name ?? "—" },
    { header: "Location", accessorFn: (row) => row.location?.name ?? "—" },
    { header: "Status", accessorKey: "status", cell: (info) => <StatusBadge status={info.getValue()} /> },
    { header: "Priority", accessorKey: "priority", cell: (info) => <StatusBadge status={info.getValue()} /> },
    { header: "Requester", accessorFn: (row) => `${row.requester.firstName} ${row.requester.lastName}` },
    {
      header: "Assignee",
      accessorFn: (row) => {
        const names = [
          ...(row.assignees ?? []).map((a: any) => `${a.user.firstName} ${a.user.lastName}`),
          ...(row.assignedTeams ?? []).map((t: any) => t.team.name),
        ];
        return names.length ? names.join(", ") : "Unassigned";
      },
    },
    {
      header: "Due",
      cell: ({ row }) => {
        const t = row.original;
        if (!t.dueAt) return "—";
        const isOverdue = dayjs(t.dueAt).isBefore(dayjs()) && !["RESOLVED", "CLOSED"].includes(t.status);
        return (
          <span style={{ color: isOverdue ? "var(--color-danger)" : undefined, fontWeight: isOverdue ? 600 : undefined }}>
            {dayjs(t.dueAt).format("DD MMM, HH:mm")}{isOverdue ? " (overdue)" : ""}
          </span>
        );
      },
    },
    { header: "Created", accessorFn: (row) => dayjs(row.createdAt).format("DD MMM YYYY") },
  ];

  const kanbanTickets: any[] = kanbanData?.items ?? [];
  function ticketsFor(s: TicketStatus) {
    return kanbanTickets.filter((t) => t.status === s);
  }
  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(Number(event.active.id));
  }
  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const ticket = kanbanTickets.find((t) => t.id === Number(active.id));
    const targetStatus = over.data.current?.status as TicketStatus | undefined;
    if (!ticket || !targetStatus || ticket.status === targetStatus) return;
    statusMutation.mutate({ id: ticket.id, status: targetStatus });
  }
  const activeDragTicket = activeDragId ? kanbanTickets.find((t) => t.id === activeDragId) ?? null : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Helpdesk & Ticketing</h1>
          <p className="page-subtitle">Raise, assign and resolve IT support requests.</p>
        </div>
        <div className="row gap-2">
          <div className="docs-view-toggle">
            <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
              <Icon name="gauge" size={13} /> Dashboard
            </button>
            <button className={view === "tickets" ? "active" : ""} onClick={() => setView("tickets")}>
              <Icon name="grid" size={13} /> Tickets
            </button>
            <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}>
              <Icon name="kanban" size={13} /> Kanban
            </button>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowApprovals(true)}>
            <Icon name="shield" size={14} /> Approvals
            {approvals && approvals.needsApproval.length > 0 && (
              <span className="badge badge-danger" style={{ marginLeft: 6 }}>{approvals.needsApproval.length}</span>
            )}
          </button>
          <PermissionGate module="helpdesk" action="create">
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> New Ticket</button>
          </PermissionGate>
        </div>
      </div>

      {view === "dashboard" ? (
        <ModuleDashboardTab
          module="helpdesk"
          catalog={HELPDESK_WIDGET_CATALOG}
          defaultLayout={DEFAULT_HELPDESK_DASHBOARD_LAYOUT}
          title="Helpdesk & Ticketing"
          showHeader={false}
        />
      ) : view === "kanban" ? (
      <>
      <FilterBar>
        <ChipSelect
          value={type}
          onChange={setType}
          placeholder="All types"
          options={TYPE_OPTIONS.map((t) => ({ value: t, label: t ? (t === "ACTION" ? "Action" : "Information") : "All types" }))}
        />
        <ChipSelect
          value={itilType}
          onChange={setItilType}
          placeholder="All ITIL types"
          options={ITIL_TYPE_OPTIONS.map((t) => ({ value: t, label: t || "All ITIL types" }))}
        />
        <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={assignedToMe} onChange={(e) => setAssignedToMe(e.target.checked)} />
          Assigned to me
        </label>
        <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          Overdue only
        </label>
        <input className="input" style={{ width: "auto", minWidth: 200 }} placeholder="Search by ticket #, title, or person..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </FilterBar>
      {kanbanTickets.length >= 100 && (
        <div className="alert alert-warning" style={{ marginBottom: 12, fontSize: 12 }}>
          Showing the first 100 matching tickets — narrow the filters above to see everything.
        </div>
      )}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="ot-board">
          {KANBAN_COLUMNS.map((col) => {
            const colTickets = ticketsFor(col.key);
            return (
              <TicketColumn key={col.key} status={col.key} label={col.label} count={kanbanLoading ? null : colTickets.length} color={col.color}>
                {kanbanLoading ? (
                  <div className="stack gap-2">
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                  </div>
                ) : colTickets.length === 0 ? (
                  <div className="ot-column-empty">No tickets</div>
                ) : (
                  colTickets.map((t) => (
                    <TicketCardView key={t.id} ticket={t} canDrag={canEdit} onOpen={() => navigate(`/helpdesk/${t.id}`)} />
                  ))
                )}
              </TicketColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeDragTicket && (
            <div className="ot-card" style={{ cursor: "grabbing", borderLeft: `3px solid ${KANBAN_COLUMNS.find((c) => c.key === activeDragTicket.status)?.color}` }}>
              <div className="ot-card-title">{activeDragTicket.ticketNumber} — {activeDragTicket.title}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </>
      ) : (
      <>
      <div style={{ marginBottom: 14 }}>
        <SavedViewBar
          tableId="helpdesk.tickets"
          currentFilters={{ status, type, itilType, assignedToMe, overdue, search }}
          onApply={(saved) => {
            setStatus(typeof saved.status === "string" ? saved.status : "");
            setType(typeof saved.type === "string" ? saved.type : "");
            setItilType(typeof saved.itilType === "string" ? saved.itilType : "");
            setAssignedToMe(typeof saved.assignedToMe === "boolean" ? saved.assignedToMe : false);
            setOverdue(typeof saved.overdue === "boolean" ? saved.overdue : false);
            setSearch(typeof saved.search === "string" ? saved.search : "");
            setPage(1);
          }}
        />
      </div>
      <FilterBar>
        <ChipSelect
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="All statuses"
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s ? s.replace("_", " ") : "All statuses" }))}
        />
        <ChipSelect
          value={type}
          onChange={(v) => { setType(v); setPage(1); }}
          placeholder="All types"
          options={TYPE_OPTIONS.map((t) => ({ value: t, label: t ? (t === "ACTION" ? "Action" : "Information") : "All types" }))}
        />
        <ChipSelect
          value={itilType}
          onChange={(v) => { setItilType(v); setPage(1); }}
          placeholder="All ITIL types"
          options={ITIL_TYPE_OPTIONS.map((t) => ({ value: t, label: t || "All ITIL types" }))}
        />
        <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={assignedToMe} onChange={(e) => { setAssignedToMe(e.target.checked); setPage(1); }} />
          Assigned to me
        </label>
        <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(1); }} />
          Overdue only
        </label>
      </FilterBar>

      <div className="card">
        <DataTable
          tableId="helpdesk.tickets"
          exportModule="helpdesk"
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/helpdesk/${row.id}`)}
          emptyMessage="No tickets found."
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder="Search by ticket #, title, or person..."
        />
      </div>
      </>
      )}

      {showForm && (
        <TicketFormModal onClose={() => setShowForm(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}

      {showApprovals && (
        <TicketApprovalsModal
          needsApproval={approvals?.needsApproval ?? []}
          sentByMe={approvals?.sentByMe ?? []}
          onClose={() => setShowApprovals(false)}
        />
      )}
    </div>
  );
}

function TicketColumn({
  status,
  label,
  count,
  color,
  children,
}: {
  status: TicketStatus;
  label: string;
  count: number | null;
  color: string;
  children: React.ReactNode;
}) {
  const droppable = useDroppable({ id: `ticket-column-${status}`, data: { status } });
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

function TicketCardView({ ticket, canDrag, onOpen }: { ticket: any; canDrag: boolean; onOpen: () => void }) {
  const draggable = useDraggable({ id: String(ticket.id), disabled: !canDrag });
  const style = draggable.transform ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`, zIndex: 5 } : undefined;
  const isOverdue = ticket.dueAt && dayjs(ticket.dueAt).isBefore(dayjs()) && !["RESOLVED", "CLOSED"].includes(ticket.status);
  const assigneeNames = [
    ...(ticket.assignees ?? []).map((a: any) => `${a.user.firstName} ${a.user.lastName}`),
    ...(ticket.assignedTeams ?? []).map((t: any) => t.team.name),
  ];

  return (
    <div
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      className="ot-card"
      onClick={(e) => { if (!draggable.isDragging) { e.stopPropagation(); onOpen(); } }}
      style={{ ...style, cursor: canDrag ? "grab" : "pointer", opacity: draggable.isDragging ? 0.35 : 1 }}
    >
      <div className="ot-card-title">{ticket.ticketNumber} — {ticket.title}</div>
      <div className="row gap-1" style={{ marginTop: 4, flexWrap: "wrap" }}>
        <StatusBadge status={ticket.itilType} />
        <StatusBadge status={ticket.priority} />
      </div>
      <div className="ot-card-footer">
        <span className="ot-card-assignee">
          <Icon name="profile" size={11} />
          {assigneeNames.length ? assigneeNames.join(", ") : "Unassigned"}
        </span>
        {ticket.dueAt && (
          <span style={{ color: isOverdue ? "var(--color-danger)" : undefined, fontWeight: isOverdue ? 600 : undefined }}>
            Due {dayjs(ticket.dueAt).format("DD MMM")}{isOverdue ? " (overdue)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
