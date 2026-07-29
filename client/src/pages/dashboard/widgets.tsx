import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart, SimplePieChart } from "../../components/ChartWrapper";
import { DataTable } from "../../components/DataTable";
import { SkeletonBlock } from "../../components/Skeleton";

interface Summary {
  kpis: {
    totalAssets: number;
    openTickets: number;
    closedTickets: number;
    lowStockCount: number;
    devicesTotal: number;
    devicesSeen24h: number;
  };
  assetsByStatus: { status: string; count: number }[];
  ticketsByStatus: { status: string; count: number }[];
}

function useSummary() {
  return useQuery<Summary>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => (await axiosClient.get("/dashboard/summary")).data,
    refetchInterval: 60_000,
  });
}

export function KpiTotalAssetsWidget() {
  const { data } = useSummary();
  return <KpiCard label="Total Assets" value={data?.kpis.totalAssets ?? "—"} icon="assets" tone="primary" />;
}

export function KpiOpenTicketsWidget() {
  const { data } = useSummary();
  return <KpiCard label="Open Tickets" value={data?.kpis.openTickets ?? "—"} icon="helpdesk" tone="warning" />;
}

export function KpiLowStockWidget() {
  const { data } = useSummary();
  return <KpiCard label="Low Stock Items" value={data?.kpis.lowStockCount ?? "—"} icon="stock" tone="danger" />;
}

export function KpiDevicesWidget() {
  const { data } = useSummary();
  return <KpiCard label="Devices Seen (24h)" value={data ? `${data.kpis.devicesSeen24h} / ${data.kpis.devicesTotal}` : "—"} icon="network" tone="success" />;
}

export function AssetsByStatusWidget() {
  const { data } = useSummary();
  return (
    <>
      <h3 className="mt-0">Assets by Status</h3>
      {data ? <SimpleBarChart data={data.assetsByStatus} xKey="status" yKey="count" /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function TicketsByStatusWidget() {
  const { data } = useSummary();
  return (
    <>
      <h3 className="mt-0">Tickets by Status</h3>
      {data ? <SimplePieChart data={data.ticketsByStatus} dataKey="count" nameKey="status" /> : <SkeletonBlock height={180} />}
    </>
  );
}

interface ActivityItem {
  id: number;
  action: string;
  entityType: string | null;
  createdAt: string;
  user: string;
}

export function RecentActivityWidget() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-activity", page],
    queryFn: async () => (await axiosClient.get("/dashboard/activity", { params: { page, pageSize: 5 } })).data,
  });

  const columns: ColumnDef<ActivityItem, any>[] = [
    { header: "Time", accessorFn: (a) => dayjs(a.createdAt).format("DD MMM, HH:mm") },
    { header: "User", accessorKey: "user" },
    { header: "Action", accessorFn: (a) => a.action + (a.entityType ? ` · ${a.entityType}` : "") },
  ];

  return (
    <>
      <h3 className="mt-0">Recent Activity</h3>
      <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} emptyMessage="No activity yet." />
    </>
  );
}

export function LowStockWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-low-stock"],
    queryFn: async () => (await axiosClient.get("/stock/low-stock")).data,
  });

  const columns: ColumnDef<any, any>[] = [
    { header: "SKU", accessorKey: "sku" },
    { header: "Name", accessorKey: "name" },
    { header: "On Hand", accessorFn: (i: any) => `${i.quantityOnHand} ${i.unit}` },
    { header: "Reorder At", accessorKey: "reorderLevel" },
  ];

  return (
    <>
      <h3 className="mt-0">Low Stock Items</h3>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={5} emptyMessage="No items are currently low on stock." />
    </>
  );
}

export function OfflineDevicesWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-devices"],
    queryFn: async () => (await axiosClient.get("/devices", { params: { pageSize: 100 } })).data.items,
  });

  const offline = (data ?? []).filter((d: any) => Date.now() - new Date(d.lastSeen).getTime() > 15 * 60 * 1000);

  const columns: ColumnDef<any, any>[] = [
    { header: "Hostname", accessorKey: "hostname" },
    { header: "MAC Address", accessorKey: "macAddress" },
    { header: "Last Seen", accessorFn: (d: any) => dayjs(d.lastSeen).format("DD MMM, HH:mm") },
  ];

  return (
    <>
      <h3 className="mt-0">Offline Devices</h3>
      <DataTable columns={columns} data={offline} isLoading={isLoading} clientPageSize={5} emptyMessage="All known devices have reported in recently." />
    </>
  );
}

export function MaintenanceDueWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-maintenance-due"],
    queryFn: async () => (await axiosClient.get("/operations/maintenance-due")).data,
  });

  const columns: ColumnDef<any, any>[] = [
    { header: "Asset", accessorFn: (a: any) => `${a.assetTag} — ${a.name}` },
    { header: "Next Service", accessorFn: (a: any) => dayjs(a.nextServiceDate).format("DD MMM YYYY") },
  ];

  return (
    <>
      <h3 className="mt-0">Maintenance Due</h3>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={5} emptyMessage="No assets are currently due for maintenance." />
    </>
  );
}

export interface WidgetDef {
  id: string;
  title: string;
  defaultCols: 1 | 2 | 4;
  Component: React.ComponentType;
}

export const WIDGET_CATALOG: WidgetDef[] = [
  { id: "kpi-total-assets", title: "Total Assets", defaultCols: 1, Component: KpiTotalAssetsWidget },
  { id: "kpi-open-tickets", title: "Open Tickets", defaultCols: 1, Component: KpiOpenTicketsWidget },
  { id: "kpi-low-stock", title: "Low Stock Items", defaultCols: 1, Component: KpiLowStockWidget },
  { id: "kpi-devices", title: "Devices Seen (24h)", defaultCols: 1, Component: KpiDevicesWidget },
  { id: "chart-assets-status", title: "Assets by Status", defaultCols: 2, Component: AssetsByStatusWidget },
  { id: "chart-tickets-status", title: "Tickets by Status", defaultCols: 2, Component: TicketsByStatusWidget },
  { id: "recent-activity", title: "Recent Activity", defaultCols: 4, Component: RecentActivityWidget },
  { id: "low-stock-list", title: "Low Stock Items (list)", defaultCols: 2, Component: LowStockWidget },
  { id: "offline-devices", title: "Offline Devices", defaultCols: 2, Component: OfflineDevicesWidget },
  { id: "maintenance-due", title: "Maintenance Due", defaultCols: 2, Component: MaintenanceDueWidget },
];

export const DEFAULT_DASHBOARD_LAYOUT = [
  { id: "kpi-total-assets", cols: 1 },
  { id: "kpi-open-tickets", cols: 1 },
  { id: "kpi-low-stock", cols: 1 },
  { id: "kpi-devices", cols: 1 },
  { id: "chart-assets-status", cols: 2 },
  { id: "chart-tickets-status", cols: 2 },
  { id: "recent-activity", cols: 4 },
];
