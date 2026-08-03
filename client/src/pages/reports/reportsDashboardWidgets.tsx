import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart } from "../../components/ChartWrapper";
import { DataTable } from "../../components/DataTable";
import { SkeletonBlock } from "../../components/Skeleton";
import { WidgetDef } from "../dashboard/widgets";
import { getSource } from "../dashboard/dataExplorerConfig";
import { ReportSummary } from "./types";

function useReports() {
  return useQuery<ReportSummary[]>({
    queryKey: ["reports-widget-list"],
    queryFn: async () => (await axiosClient.get("/reports")).data,
  });
}

function useSharedReports() {
  return useQuery<ReportSummary[]>({
    queryKey: ["reports-widget-shared"],
    queryFn: async () => (await axiosClient.get("/reports/shared-with-me")).data,
  });
}

export function ReportsTotalWidget() {
  const { data } = useReports();
  return <KpiCard label="My Reports" value={data?.length ?? "—"} icon="file" tone="primary" />;
}

export function ReportsSharedWidget() {
  const { data } = useSharedReports();
  return <KpiCard label="Shared With Me" value={data?.length ?? "—"} icon="link" tone="success" />;
}

export function ReportsBySourceWidget() {
  const { data } = useReports();
  const grouped = data
    ? Object.entries(
        data.reduce<Record<string, number>>((acc, r) => {
          const label = getSource(r.source)?.label ?? r.source;
          acc[label] = (acc[label] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([source, count]) => ({ source, count }))
    : undefined;
  return (
    <>
      <h3 className="mt-0">Reports by Source</h3>
      {grouped ? (
        grouped.length ? <SimpleBarChart data={grouped} xKey="source" yKey="count" glow /> : <div className="empty-state">No reports yet.</div>
      ) : (
        <SkeletonBlock height={180} />
      )}
    </>
  );
}

function ReportsQuickLaunchTable({ title, useData, tableId, emptyMessage }: { title: string; useData: () => ReturnType<typeof useReports>; tableId: string; emptyMessage: string }) {
  const { data, isLoading } = useData();
  const navigate = useNavigate();

  const columns: ColumnDef<ReportSummary, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "Source", accessorFn: (r) => getSource(r.source)?.label ?? r.source },
    { header: "Updated", accessorFn: (r) => dayjs(r.updatedAt).format("DD MMM, HH:mm") },
  ];

  return (
    <>
      <h3 className="mt-0">{title}</h3>
      <DataTable
        tableId={tableId}
        defaultViewMode="list"
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        clientPageSize={5}
        emptyMessage={emptyMessage}
        searchable={false}
        onRowClick={(r) => navigate(`/reports/${r.id}`)}
      />
    </>
  );
}

export function MyReportsListWidget() {
  return <ReportsQuickLaunchTable title="My Reports" useData={useReports} tableId="dashboard.reports.mine" emptyMessage="You haven't built any reports yet." />;
}

export function SharedReportsListWidget() {
  return <ReportsQuickLaunchTable title="Shared With Me" useData={useSharedReports} tableId="dashboard.reports.shared" emptyMessage="No reports have been shared with you yet." />;
}

export const REPORTS_WIDGET_CATALOG: WidgetDef[] = [
  { id: "reports-total", title: "My Reports", defaultCols: 1, Component: ReportsTotalWidget },
  { id: "reports-shared", title: "Shared With Me", defaultCols: 1, Component: ReportsSharedWidget },
  { id: "reports-by-source", title: "Reports by Source", defaultCols: 2, Component: ReportsBySourceWidget },
  { id: "reports-my-list", title: "My Reports (list)", defaultCols: 2, Component: MyReportsListWidget },
  { id: "reports-shared-list", title: "Shared Reports (list)", defaultCols: 2, Component: SharedReportsListWidget },
];

export const DEFAULT_REPORTS_DASHBOARD_LAYOUT = [
  { id: "reports-total", cols: 1 },
  { id: "reports-shared", cols: 1 },
  { id: "reports-by-source", cols: 2 },
  { id: "reports-my-list", cols: 2 },
  { id: "reports-shared-list", cols: 2 },
];
