import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";

interface ShowStatusAsset {
  id: number;
  assetTag: string;
  name: string;
  alive: boolean;
  responseTimeMs: number | null;
}

interface ShowStatusResponse {
  total: number;
  active: number;
  assets: ShowStatusAsset[];
}

const showAssetColumns: ColumnDef<ShowStatusAsset, any>[] = [
  { header: "Asset Tag", accessorKey: "assetTag" },
  { header: "Name", accessorKey: "name" },
  {
    header: "Status",
    accessorFn: (r) => (r.alive ? "Active" : "Unreachable"),
    cell: ({ row }) => (
      <span className={`badge ${row.original.alive ? "badge-success" : "badge-danger"}`}>
        {row.original.alive ? "Active" : "Unreachable"}
      </span>
    ),
  },
  {
    header: "Latency",
    accessorFn: (r) => r.responseTimeMs ?? "",
    cell: ({ row }) => (row.original.responseTimeMs != null ? `${row.original.responseTimeMs} ms` : "—"),
  },
];

function GaugeCard({ data, isLoading }: { data: ShowStatusResponse | undefined; isLoading: boolean }) {
  const total = data?.total ?? 0;
  const active = data?.active ?? 0;
  const pct = total > 0 ? Math.round((active / total) * 100) : 0;

  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const color = total === 0 ? "var(--color-text-muted)" : pct >= 100 ? "var(--color-success)" : pct >= 50 ? "var(--color-primary)" : "var(--color-danger)";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div className="row gap-2" style={{ alignSelf: "flex-start" }}>
        <Icon name="gauge" size={16} />
        <span className="kpi-label">ACTIVE SHOW ASSETS</span>
      </div>

      <div style={{ position: "relative", width: 160, height: 160 }}>
        <svg width={160} height={160} viewBox="0 0 160 160">
          <circle cx={80} cy={80} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={12} />
          <circle
            cx={80}
            cy={80}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={isLoading ? circumference : offset}
            transform="rotate(-90 80 80)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{isLoading ? "…" : `${pct}%`}</span>
          <span className="muted" style={{ fontSize: 12 }}>{isLoading ? "pinging…" : `${active} / ${total}`}</span>
        </div>
      </div>

      {total === 0 && !isLoading && (
        <p className="muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
          No asset categories are flagged as "Show Asset" yet. Flag one in Admin &amp; Setup → Asset Categories to populate this gauge.
        </p>
      )}
    </div>
  );
}

export function OperationalContextPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["assets-show-status"],
    queryFn: async () => (await axiosClient.get("/assets/show-status")).data as ShowStatusResponse,
    refetchInterval: 15000,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operational Context</h1>
          <p className="page-subtitle">Live reachability of assets flagged as show-critical.</p>
        </div>
      </div>

      <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <GaugeCard data={data} isLoading={isLoading} />
      </div>

      {data && data.total > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="mt-0 mb-2">Show Assets</h3>
          <DataTable columns={showAssetColumns} data={data.assets} clientPageSize={10} emptyMessage="No show assets." />
        </div>
      )}
    </div>
  );
}
