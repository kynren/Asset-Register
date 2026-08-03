import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart, SimplePieChart } from "../../components/ChartWrapper";
import { DataTable } from "../../components/DataTable";
import { SkeletonBlock } from "../../components/Skeleton";
import { WidgetDef } from "../dashboard/widgets";

interface DocStats {
  total: number;
  byCategory: { category: string; count: number }[];
  byType: { docType: string; count: number }[];
  reviewOverdueCount: number;
}

function useDocStats(filters?: Record<string, string>) {
  return useQuery<DocStats>({
    queryKey: ["docs-dashboard-stats", filters],
    queryFn: async () => (await axiosClient.get("/docs/stats", { params: filters })).data,
    refetchInterval: 60_000,
  });
}

export function DocsTotalWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useDocStats(filters);
  return <KpiCard label="Docs & SOPs" value={data?.total ?? "—"} icon="book" tone="primary" />;
}

export function DocsReviewOverdueWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useDocStats(filters);
  const overdue = data?.reviewOverdueCount ?? 0;
  return <KpiCard label="Overdue for Review" value={overdue} icon="alertTriangle" tone={overdue > 0 ? "danger" : "success"} />;
}

export function DocsByCategoryWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useDocStats(filters);
  return (
    <>
      <h3 className="mt-0">Docs by Category</h3>
      {data ? <SimpleBarChart data={data.byCategory} xKey="category" yKey="count" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function DocsByTypeWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useDocStats(filters);
  return (
    <>
      <h3 className="mt-0">Docs by Type</h3>
      {data ? <SimplePieChart data={data.byType} dataKey="count" nameKey="docType" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function RecentlyUpdatedDocsWidget({ filters }: { filters?: Record<string, string> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-docs-recent", filters],
    queryFn: async () => (await axiosClient.get("/docs/library", { params: filters })).data.slice(0, 5),
  });

  const columns: ColumnDef<any, any>[] = [
    { header: "Title", accessorKey: "title" },
    { header: "Category", accessorKey: "category" },
    { header: "Updated", accessorFn: (d: any) => dayjs(d.updatedAt).format("DD MMM YYYY") },
  ];

  return (
    <>
      <h3 className="mt-0">Recently Updated</h3>
      <DataTable tableId="dashboard.docs.recent" defaultViewMode="list" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={5} emptyMessage="No documents yet." searchable={false} />
    </>
  );
}

export const DOCS_WIDGET_CATALOG: WidgetDef[] = [
  { id: "docs-total", title: "Docs & SOPs", defaultCols: 1, Component: DocsTotalWidget },
  { id: "docs-review-overdue", title: "Overdue for Review", defaultCols: 1, Component: DocsReviewOverdueWidget },
  { id: "docs-by-category", title: "Docs by Category", defaultCols: 2, Component: DocsByCategoryWidget },
  { id: "docs-by-type", title: "Docs by Type", defaultCols: 2, Component: DocsByTypeWidget },
  { id: "docs-recent", title: "Recently Updated", defaultCols: 2, Component: RecentlyUpdatedDocsWidget },
];

export const DEFAULT_DOCS_DASHBOARD_LAYOUT = [
  { id: "docs-total", cols: 1 },
  { id: "docs-review-overdue", cols: 1 },
  { id: "docs-by-category", cols: 2 },
  { id: "docs-recent", cols: 2 },
];
