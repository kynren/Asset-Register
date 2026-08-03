import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { FormModal } from "../../components/FormModal";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";

interface ApprovalRow {
  id: number;
  ticket: { id: number; ticketNumber: string; title: string; status: string };
  requestedBy: { id: number; firstName: string; lastName: string };
  targetUser: { id: number; firstName: string; lastName: string } | null;
  targetTeam: { id: number; name: string } | null;
  status: string;
  createdAt: string;
}

export function TicketApprovalsModal({
  needsApproval,
  sentByMe,
  onClose,
}: {
  needsApproval: ApprovalRow[];
  sentByMe: ApprovalRow[];
  onClose: () => void;
}) {
  const navigate = useNavigate();

  function goToTicket(row: ApprovalRow) {
    onClose();
    navigate(`/helpdesk/${row.ticket.id}`);
  }

  const needsApprovalColumns: ColumnDef<ApprovalRow, any>[] = [
    { header: "Ticket #", accessorFn: (r) => r.ticket.ticketNumber, meta: { cardTitle: true } },
    { header: "Title", accessorFn: (r) => r.ticket.title },
    { header: "Ticket Status", cell: ({ row }) => <StatusBadge status={row.original.ticket.status} /> },
    { header: "Requested By", accessorFn: (r) => `${r.requestedBy.firstName} ${r.requestedBy.lastName}` },
    { header: "Requested", accessorFn: (r) => dayjs(r.createdAt).format("DD MMM YYYY") },
  ];

  const sentByMeColumns: ColumnDef<ApprovalRow, any>[] = [
    { header: "Ticket #", accessorFn: (r) => r.ticket.ticketNumber, meta: { cardTitle: true } },
    { header: "Title", accessorFn: (r) => r.ticket.title },
    { header: "Target", accessorFn: (r) => (r.targetUser ? `${r.targetUser.firstName} ${r.targetUser.lastName}` : r.targetTeam?.name ?? "—") },
    { header: "Approval Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: "Requested", accessorFn: (r) => dayjs(r.createdAt).format("DD MMM YYYY") },
  ];

  return (
    <FormModal title="Ticket Approvals" onClose={onClose} hideFooter maxWidth={860}>
      <div className="stack gap-3">
        <div>
          <h4 className="mt-0">Needs Your Approval</h4>
          <DataTable
            tableId="helpdesk.approvals.needsMine"
            columns={needsApprovalColumns}
            data={needsApproval}
            clientPageSize={5}
            defaultViewMode="list"
            onRowClick={goToTicket}
            emptyMessage="Nothing is waiting on your approval."
          />
        </div>
        <div>
          <h4>Sent By You</h4>
          <DataTable
            tableId="helpdesk.approvals.sentByMe"
            columns={sentByMeColumns}
            data={sentByMe}
            clientPageSize={5}
            defaultViewMode="list"
            onRowClick={goToTicket}
            emptyMessage="You haven't requested any approvals."
          />
        </div>
      </div>
    </FormModal>
  );
}
