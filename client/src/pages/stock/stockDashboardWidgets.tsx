import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart } from "../../components/ChartWrapper";
import { SkeletonBlock } from "../../components/Skeleton";
import { LowStockWidget, WidgetDef } from "../dashboard/widgets";

interface StockStats {
  totalItems: number;
  totalOnHand: number;
  totalValue: number;
  lowStockCount: number;
  byCategory: { category: string; count: number }[];
}

function useStockStats(filters?: Record<string, string>) {
  return useQuery<StockStats>({
    queryKey: ["stock-dashboard-stats", filters],
    queryFn: async () => (await axiosClient.get("/stock/stats", { params: filters })).data,
    refetchInterval: 60_000,
  });
}

export function StockTotalItemsWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useStockStats(filters);
  return <KpiCard label="Total Stock Items" value={data?.totalItems ?? "—"} icon="stock" tone="primary" />;
}

export function StockLowCountWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useStockStats(filters);
  return <KpiCard label="Low Stock Items" value={data?.lowStockCount ?? "—"} icon="alertTriangle" tone="danger" />;
}

export function StockTotalValueWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useStockStats(filters);
  const value = data ? Math.round(data.totalValue).toLocaleString(undefined, { style: "currency", currency: "GBP", maximumFractionDigits: 0 }) : "—";
  return <KpiCard label="Total Stock Value" value={value} icon="creditCard" tone="success" />;
}

export function StockByCategoryWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useStockStats(filters);
  return (
    <>
      <h3 className="mt-0">Stock Items by Category</h3>
      {data ? <SimpleBarChart data={data.byCategory} xKey="category" yKey="count" glow /> : <SkeletonBlock height={180} />}
    </>
  );
}

export const STOCK_WIDGET_CATALOG: WidgetDef[] = [
  { id: "stock-total-items", title: "Total Stock Items", defaultCols: 1, Component: StockTotalItemsWidget },
  { id: "stock-low-count", title: "Low Stock Items", defaultCols: 1, Component: StockLowCountWidget },
  { id: "stock-total-value", title: "Total Stock Value", defaultCols: 1, Component: StockTotalValueWidget },
  { id: "stock-by-category", title: "Stock Items by Category", defaultCols: 2, Component: StockByCategoryWidget },
  { id: "stock-low-list", title: "Low Stock Items (list)", defaultCols: 2, Component: LowStockWidget },
];

export const DEFAULT_STOCK_DASHBOARD_LAYOUT = [
  { id: "stock-total-items", cols: 1 },
  { id: "stock-low-count", cols: 1 },
  { id: "stock-total-value", cols: 1 },
  { id: "stock-by-category", cols: 2 },
  { id: "stock-low-list", cols: 2 },
];
