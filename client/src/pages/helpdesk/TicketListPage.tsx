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
import dayjs from "dayjs";

const STATUS_OPTIONS = ["", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export function TicketListPage() {
  const [status, setStatus] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tickets", { status, assignedToMe, overdue, page }],
    queryFn: async () =>
      (
        await axiosClient.get("/tickets", {
          params: { status: status || undefined, assignedToMe: assignedToMe || undefined, overdue: overdue || undefined, page, pageSize: 15 },
        })
      ).data,
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
    { header: "Category", accessorFn: (row) => row.category?.name ?? "—" },
    { header: "Status", accessorKey: "status", cell: (info) => <StatusBadge status={info.getValue()} /> },
    { header: "Priority", accessorKey: "priority", cell: (info) => <StatusBadge status={info.getValue()} /> },
    { header: "Requester", accessorFn: (row) => `${row.requester.firstName} ${row.requester.lastName}` },
    { header: "Assignee", accessorFn: (row) => (row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : "Unassigned") },
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
        <PermissionGate module="helpdesk" action="create">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> New Ticket</button>
        </PermissionGate>
      </div>

      <FilterBar>
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>)}
        </select>
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
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/helpdesk/${row.id}`)}
          emptyMessage="No tickets found."
        />
      </div>

      {showForm && (
        <TicketFormModal onClose={() => setShowForm(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}
    </div>
  );
}
