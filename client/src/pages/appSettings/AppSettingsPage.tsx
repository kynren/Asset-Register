import { useState } from "react";
import { OrganizationsTab } from "./OrganizationsTab";
import { BackupsTab } from "./BackupsTab";
import { SystemSettingsTab } from "./SystemSettingsTab";
import { SystemStatusTab } from "./SystemStatusTab";

const TABS = [
  { key: "organizations", label: "Organizations" },
  { key: "backups", label: "Backups" },
  { key: "settings", label: "System Settings" },
  { key: "status", label: "System Status" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AppSettingsPage() {
  const [tab, setTab] = useState<TabKey>("organizations");

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">App Settings</h1>
          <p className="page-subtitle">Platform-level administration — organizations, backups, and system-wide settings. Visible only to System Admin.</p>
        </div>
      </div>

      <div className="row gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "organizations" && <OrganizationsTab />}
      {tab === "backups" && <BackupsTab />}
      {tab === "settings" && <SystemSettingsTab />}
      {tab === "status" && <SystemStatusTab />}
    </div>
  );
}
