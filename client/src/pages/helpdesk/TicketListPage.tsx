import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { TicketFormModal, TicketFormValues } from "./TicketFormModal";
import { TicketApprovalsModal } from "./TicketApprovalsModal";
import { ModuleDashboardTab } from "../dashboard/ModuleDashboardTab";
import { HELPDESK_WIDGET_CATALOG, DEFAULT_HELPDESK_DASHBOARD_LAYOUT } from "./helpdeskDashboardWidgets";
import { ChipSelect } from "../../components/ChipSelect";
import dayjs from "dayjs";

const STATUS_OPTIONS = ["", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
const TYPE_OPTIONS = ["", "ACTION", "INFORMATION"];
const ITIL_TYPE_OPTIONS = ["", "INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];

export function TicketListPage() {
  const [view, setView] = useState<"tickets" | "dashboard">("dashboard");
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
      ) : (
      <>
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
