import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from "../../components/ChartWrapper";
import { SkeletonBlock } from "../../components/Skeleton";
import { CustomQueryConfig } from "./CustomQueryConfigModal";
import { getSource } from "./dataExplorerConfig";

type QueryResult =
  | { kind: "kpi"; value: number }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "chart"; data: { label: string; count: number }[] };

export function CustomQueryWidget({ config }: { config: CustomQueryConfig }) {
  const source = getSource(config.source);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["custom-query-widget", config],
    queryFn: async () =>
      (
        await axiosClient.post("/dashboard/query", {
          source: config.source,
          filters: { combinator: config.combinator, conditions: config.conditions.filter((c) => c.field && c.operator) },
          groupBy: config.groupBy,
          visualization: config.visualization,
        })
      ).data as QueryResult,
  });

  if (isLoading) return <SkeletonBlock height={config.visualization === "kpi" ? 60 : 200} />;
  if (isError || !data) return <div className="empty-state">Couldn't load this widget's data.</div>;

  if (data.kind === "kpi") {
    return <KpiCard label={config.title} value={data.value} icon="gauge" tone="primary" />;
  }

  if (data.kind === "table") {
    return (
      <>
        <h3 className="mt-0">{config.title}</h3>
        {data.rows.length === 0 ? (
          <div className="empty-state">No matching records.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ad-table">
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {data.columns.map((c) => (
                      <td key={c}>{formatCell(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  // chart
  return (
    <>
      <h3 className="mt-0">{config.title}</h3>
      {data.data.length === 0 ? (
        <div className="empty-state">No matching records.</div>
      ) : config.visualization === "pie" ? (
        <SimplePieChart data={data.data} dataKey="count" nameKey="label" glow />
      ) : config.visualization === "line" ? (
        <SimpleLineChart data={data.data} xKey="label" lines={[{ key: "count" }]} />
      ) : (
        <SimpleBarChart data={data.data} xKey="label" yKey="count" glow />
      )}
    </>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString();
  return String(value);
}
