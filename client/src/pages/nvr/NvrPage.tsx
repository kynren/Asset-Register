import { useState } from "react";
import { DeviceManagementTab } from "./DeviceManagementTab";
import { LiveViewTab } from "./LiveViewTab";
import { EventLogTab } from "./EventLogTab";

const TABS = [
  { key: "devices", label: "Device Management" },
  { key: "live", label: "Live View" },
  { key: "events", label: "Event Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function NvrPage() {
  const [tab, setTab] = useState<TabKey>("devices");

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">NVRs & Cameras</h1>
          <p className="page-subtitle">Device management, live view, and event log — modeled on Hikvision iVMS workflows.</p>
        </div>
      </div>

      <div className="row gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "devices" && <DeviceManagementTab />}
      {tab === "live" && <LiveViewTab />}
      {tab === "events" && <EventLogTab />}
    </div>
  );
}
