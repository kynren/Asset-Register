import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { KpiCard } from "../../components/KpiCard";
import { RadialGauge } from "../../components/RadialGauge";
import { SkeletonBlock } from "../../components/Skeleton";
import { OfflineDevicesWidget, WidgetDef } from "../dashboard/widgets";

interface NetworkSummary {
  monitored: { total: number; online: number; offline: number };
  agent: { total: number; online: number; offline: number };
  subnetCount: number;
}

function useNetworkSummary(filters?: Record<string, string>) {
  return useQuery<NetworkSummary>({
    queryKey: ["network-dashboard-summary", filters],
    queryFn: async () => (await axiosClient.get("/network/monitor/summary", { params: filters })).data,
    refetchInterval: 60_000,
  });
}

export function MonitoredDevicesTotalWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useNetworkSummary(filters);
  return <KpiCard label="Monitored Devices" value={data?.monitored.total ?? "—"} icon="network" tone="primary" />;
}

export function MonitoredOnlineGaugeWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useNetworkSummary(filters);
  const pct = data && data.monitored.total > 0 ? Math.round((data.monitored.online / data.monitored.total) * 100) : 0;
  return (
    <>
      <h3 className="mt-0">Monitored Devices Online</h3>
      {data ? <RadialGauge value={pct} tone="success" sublabel={`${data.monitored.online} of ${data.monitored.total}`} /> : <SkeletonBlock height={150} />}
    </>
  );
}

export function AgentDevicesTotalWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useNetworkSummary(filters);
  return (
    <KpiCard
      label="Agent Devices Seen (15m)"
      value={data ? `${data.agent.online} / ${data.agent.total}` : "—"}
      icon="cpu"
      tone="success"
      live
    />
  );
}

export function DiscoveredSubnetsWidget({ filters }: { filters?: Record<string, string> }) {
  const { data } = useNetworkSummary(filters);
  return <KpiCard label="Discovered Subnets" value={data?.subnetCount ?? "—"} icon="layers" tone="neutral" />;
}

export const NETWORK_WIDGET_CATALOG: WidgetDef[] = [
  { id: "network-monitored-total", title: "Monitored Devices", defaultCols: 1, Component: MonitoredDevicesTotalWidget },
  { id: "network-online-gauge", title: "Monitored Devices Online", defaultCols: 1, Component: MonitoredOnlineGaugeWidget },
  { id: "network-agent-total", title: "Agent Devices Seen (15m)", defaultCols: 1, Component: AgentDevicesTotalWidget },
  { id: "network-subnets", title: "Discovered Subnets", defaultCols: 1, Component: DiscoveredSubnetsWidget },
  { id: "network-offline-devices", title: "Offline Devices", defaultCols: 2, Component: OfflineDevicesWidget },
];

export const DEFAULT_NETWORK_DASHBOARD_LAYOUT = [
  { id: "network-monitored-total", cols: 1 },
  { id: "network-online-gauge", cols: 1 },
  { id: "network-agent-total", cols: 1 },
  { id: "network-subnets", cols: 1 },
  { id: "network-offline-devices", cols: 2 },
];
