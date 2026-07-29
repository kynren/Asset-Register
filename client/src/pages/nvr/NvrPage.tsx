import { useState } from "react";
import { LiveVideoMatrixTab } from "./LiveVideoMatrixTab";
import { NvrPlaybackCenterTab } from "./NvrPlaybackCenterTab";
import { DiscoveryProtocolTab } from "./DiscoveryProtocolTab";
import { DeviceManagementTab } from "./DeviceManagementTab";
import { EventLogTab } from "./EventLogTab";

const TABS = [
  { key: "matrix", label: "Live Video Matrix" },
  { key: "playback", label: "NVR Playback Center" },
  { key: "discovery", label: "Discovery Protocol" },
  { key: "config", label: "Config Server" },
  { key: "events", label: "Event Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function NvrPage() {
  const [tab, setTab] = useState<TabKey>("matrix");

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">NVRs & Cameras</h1>
          <p className="page-subtitle">Live video matrix, playback, discovery, and device configuration — modeled on Hikvision iVMS workflows.</p>
        </div>
      </div>

      <div className="row gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "matrix" && <LiveVideoMatrixTab />}
      {tab === "playback" && <NvrPlaybackCenterTab />}
      {tab === "discovery" && <DiscoveryProtocolTab />}
      {tab === "config" && <DeviceManagementTab />}
      {tab === "events" && <EventLogTab />}
    </div>
  );
}
