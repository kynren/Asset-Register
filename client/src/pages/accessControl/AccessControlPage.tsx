import { useState } from "react";
import { DevicesDoorsTab } from "./DevicesDoorsTab";
import { CredentialsTab } from "./CredentialsTab";
import { AccessEventLogTab } from "./AccessEventLogTab";

const TABS = [
  { key: "devices", label: "Devices & Doors" },
  { key: "credentials", label: "Credentials" },
  { key: "events", label: "Event Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AccessControlPage() {
  const [tab, setTab] = useState<TabKey>("devices");

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Access Control</h1>
          <p className="page-subtitle">Door controllers, remote door control, credentials, and the access event log — over Hikvision ISAPI.</p>
        </div>
      </div>

      <div className="row gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "devices" && <DevicesDoorsTab />}
      {tab === "credentials" && <CredentialsTab />}
      {tab === "events" && <AccessEventLogTab />}
    </div>
  );
}
