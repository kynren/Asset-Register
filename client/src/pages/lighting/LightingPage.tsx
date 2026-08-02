import { useState } from "react";
import { ZigbeeScaffoldTab } from "../../components/ZigbeeScaffoldTab";
import { DashboardTab } from "./DashboardTab";
import { DevicesTab } from "./DevicesTab";
import { ScenesTab } from "./ScenesTab";
import { AutomationsTab } from "./AutomationsTab";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "devices", label: "Devices" },
  { key: "scenes", label: "Scenes" },
  { key: "automations", label: "Automations" },
  { key: "zigbee", label: "ZigBee" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function LightingPage() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Lighting</h1>
            <p className="muted">Control lighting and IoT devices over the local network — Shelly, Tasmota, or any device with an HTTP control endpoint. No cloud account required.</p>
          </div>
        </div>

        <div className="row gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "devices" && <DevicesTab />}
      {tab === "scenes" && <ScenesTab />}
      {tab === "automations" && <AutomationsTab />}
      {tab === "zigbee" && <ZigbeeScaffoldTab apiBase="/lighting" module="lighting" />}
    </div>
  );
}
