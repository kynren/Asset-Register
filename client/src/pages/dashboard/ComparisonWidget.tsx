import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { SimpleBarChart } from "../../components/ChartWrapper";
import { SkeletonBlock } from "../../components/Skeleton";
import { ComparisonQueryConfig } from "./ComparisonConfigModal";

type QueryResult = { kind: "chart"; data: { label: string; count: number }[] };

export function ComparisonWidget({ config }: { config: ComparisonQueryConfig }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["comparison-widget", config],
    queryFn: async () =>
      (
        await axiosClient.post("/dashboard/query-multi", {
          sources: config.sources.map((s) => ({ source: s.source, label: s.label || undefined })),
        })
      ).data as QueryResult,
  });

  if (isLoading) return <SkeletonBlock height={200} />;
  if (isError || !data) return <div className="empty-state">Couldn't load this widget's data.</div>;

  return (
    <>
      <h3 className="mt-0">{config.title}</h3>
      {data.data.length === 0 ? <div className="empty-state">No sources configured.</div> : <SimpleBarChart data={data.data} xKey="label" yKey="count" glow />}
    </>
  );
}
