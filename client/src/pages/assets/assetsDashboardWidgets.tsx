import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart, SimplePieChart } from "../../components/ChartWrapper";
import { DataTable } from "../../components/DataTable";
import { SkeletonBlock } from "../../components/Skeleton";
import { WidgetDef } from "../dashboard/widgets";

interface AssetStats {
  total: number;
  byCategory: { categoryId: number | null; name: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

function useAssetStats(filters?: Record<string, string>) {
  return useQuery<AssetStats>({
    queryKey: ["assets-dashboard-stats", filters],
    queryFn: async () => (await axiosClient.get("/assets/stats", { params: filters })).data,
    refetchInterval: 60_000,
  });
}

export function AssetsTotalWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useAssetStats(filters);
  return <KpiCard label="Total Assets" value={data?.total ?? "—"} icon="assets" tone="primary" />;
}

export function AssetsByCategoryWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useAssetStats(filters);
  return (
    <>
      <h3 className="mt-0">Assets by Category</h3>
      {data ? <SimpleBarChart data={data.byCategory} xKey="name" yKey="count" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function AssetsByStatusWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useAssetStats(filters);
  return (
    <>
      <h3 className="mt-0">Assets by Status</h3>
      {data ? <SimplePieChart data={data.byStatus} dataKey="count" nameKey="status" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export function RecentlyAddedAssetsWidget({ filters }: { filters?: Record<string, string> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-assets-recent", filters],
    queryFn: async () => (await axiosClient.get("/assets", { params: { ...filters, page: 1, pageSize: 5 } })).data.items,
  });

  const columns: ColumnDef<any, any>[] = [
    { header: "Asset Tag", accessorKey: "assetTag" },
    { header: "Name", accessorKey: "name" },
    { header: "Added", accessorFn: (a: any) => dayjs(a.createdAt).format("DD MMM YYYY") },
  ];

  return (
    <>
      <h3 className="mt-0">Recently Added</h3>
      <DataTable tableId="dashboard.assets.recent" defaultViewMode="list" columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={5} emptyMessage="No assets yet." searchable={false} />
    </>
  );
}

export const ASSETS_WIDGET_CATALOG: WidgetDef[] = [
  { id: "assets-total", title: "Total Assets", defaultCols: 1, Component: AssetsTotalWidget },
  { id: "assets-by-category", title: "Assets by Category", defaultCols: 2, Component: AssetsByCategoryWidget },
  { id: "assets-by-status", title: "Assets by Status", defaultCols: 2, Component: AssetsByStatusWidget },
  { id: "assets-recent", title: "Recently Added", defaultCols: 2, Component: RecentlyAddedAssetsWidget },
];

export const DEFAULT_ASSETS_DASHBOARD_LAYOUT = [
  { id: "assets-total", cols: 1 },
  { id: "assets-by-category", cols: 2 },
  { id: "assets-by-status", cols: 2 },
  { id: "assets-recent", cols: 2 },
];
