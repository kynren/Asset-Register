import { useState } from "react";
import { Icon } from "../../components/Icon";
import { TopologyGraphTab } from "./TopologyGraphTab";
import { PingConsoleTab } from "./PingConsoleTab";
import { DevicesTab } from "./DevicesTab";
import { IpRangeScannerTab } from "./IpRangeScannerTab";
import { SwitchingTab } from "./SwitchingTab";
import { MonitoringTab } from "./MonitoringTab";

const TABS = [
  { key: "graph", label: "Topology Graph", icon: "network" },
  { key: "pinger", label: "ICMP Pinger", icon: "activity" },
  { key: "scanner", label: "IP Range Scanner", icon: "radar" },
  { key: "switching", label: "Switching", icon: "route" },
  { key: "monitoring", label: "Monitoring", icon: "gauge" },
  { key: "clients", label: "App Client Devices", icon: "grid" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function NetworkMapPage() {
  const [tab, setTab] = useState<TabKey>("graph");

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Network Topology Map</h1>
            <p className="page-subtitle">Topology graph, live ICMP diagnostics, active IP scanning, and agent-reported client devices.</p>
          </div>
        </div>

        <div className="row gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={13} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "graph" && <TopologyGraphTab />}
      {tab === "pinger" && <PingConsoleTab />}
      {tab === "scanner" && <IpRangeScannerTab />}
      {tab === "switching" && <SwitchingTab />}
      {tab === "monitoring" && <MonitoringTab />}
      {tab === "clients" && <DevicesTab />}
    </div>
  );
}
