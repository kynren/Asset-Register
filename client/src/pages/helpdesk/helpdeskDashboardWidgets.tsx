import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart, SimplePieChart } from "../../components/ChartWrapper";
import { DataTable } from "../../components/DataTable";
import { SkeletonBlock } from "../../components/Skeleton";
import { WidgetDef } from "../dashboard/widgets";

interface TicketStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  overdueCount: number;
  myOpenCount: number;
}

function useTicketStats(filters?: Record<string, string>) {
  return useQuery<TicketStats>({
    queryKey: ["tickets-dashboard-stats", filters],
    queryFn: async () => (await axiosClient.get("/tickets/stats", { params: filters })).data,
    refetchInterval: 60_000,
  });
}

export function TicketsTotalWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useTicketStats(filters);
  return <KpiCard label="Total Tickets" value={data?.total ?? "—"} icon="helpdesk" tone="primary" />;
}

export function TicketsOverdueWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useTicketStats(filters);
  return <KpiCard label="Overdue Tickets" value={data?.overdueCount ?? "—"} icon="alertTriangle" tone="danger" />;
}

export function TicketsMineWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useTicketStats(filters);
  return <KpiCard label="Assigned to Me (Open)" value={data?.myOpenCount ?? "—"} icon="shield" tone="warning" />;
}

export function TicketsByStatusWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useTicketStats(filters);
  return (
    <>
      <h3 className="mt-0">Tickets by Status</h3>
      {data ? <SimplePieChart data={data.byStatus} dataKey="count" nameKey="status" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function TicketsByPriorityWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useTicketStats(filters);
  return (
    <>
      <h3 className="mt-0">Tickets by Priority</h3>
      {data ? <SimpleBarChart data={data.byPriority} xKey="priority" yKey="count" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function NeedsMyApprovalWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-ticket-approvals"],
    queryFn: async () => (await axiosClient.get("/tickets/approvals")).data.needsApproval,
  });

  const columns: ColumnDef<any, any>[] = [
    { header: "Ticket #", accessorFn: (a: any) => a.ticket.ticketNumber },
    { header: "Title", accessorFn: (a: any) => a.ticket.title },
    { header: "Requested By", accessorFn: (a: any) => `${a.requestedBy.firstName} ${a.requestedBy.lastName}` },
    { header: "Requested", accessorFn: (a: any) => dayjs(a.createdAt).format("DD MMM YYYY") },
  ];

  return (
    <>
      <h3 className="mt-0">Needs Your Approval</h3>
      <DataTable tableId="dashboard.helpdesk.needsApproval" defaultViewMode="list" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={5} emptyMessage="Nothing is waiting on your approval." searchable={false} />
    </>
  );
}

export const HELPDESK_WIDGET_CATALOG: WidgetDef[] = [
  { id: "tickets-total", title: "Total Tickets", defaultCols: 1, Component: TicketsTotalWidget },
  { id: "tickets-overdue", title: "Overdue Tickets", defaultCols: 1, Component: TicketsOverdueWidget },
  { id: "tickets-mine", title: "Assigned to Me (Open)", defaultCols: 1, Component: TicketsMineWidget },
  { id: "tickets-by-status", title: "Tickets by Status", defaultCols: 2, Component: TicketsByStatusWidget },
  { id: "tickets-by-priority", title: "Tickets by Priority", defaultCols: 2, Component: TicketsByPriorityWidget },
  { id: "tickets-needs-approval", title: "Needs Your Approval", defaultCols: 2, Component: NeedsMyApprovalWidget },
];

export const DEFAULT_HELPDESK_DASHBOARD_LAYOUT = [
  { id: "tickets-total", cols: 1 },
  { id: "tickets-overdue", cols: 1 },
  { id: "tickets-mine", cols: 1 },
  { id: "tickets-by-status", cols: 2 },
  { id: "tickets-by-priority", cols: 2 },
];
