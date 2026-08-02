import { useState } from "react";
import { OrganizationsTab } from "./OrganizationsTab";
import { BackupsTab } from "./BackupsTab";
import { SystemSettingsTab } from "./SystemSettingsTab";
import { SystemStatusTab } from "./SystemStatusTab";
import { RolesTab } from "../admin/RolesTab";
import { useAuth } from "../../auth/AuthContext";

const TABS = [
  { key: "organizations", label: "Organizations" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "backups", label: "Backups" },
  { key: "settings", label: "System Settings" },
  { key: "status", label: "System Status" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AppSettingsPage() {
  const [tab, setTab] = useState<TabKey>("organizations");
  const { organization } = useAuth();

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
      {tab === "roles" && (
        <div className="stack gap-3">
          <p className="muted" style={{ margin: 0 }}>
            Editing roles for <strong>{organization?.name ?? "the current organization"}</strong>. Use the organization
            switcher in the account menu (top right) to manage a different organization's roles.
          </p>
          <RolesTab />
        </div>
      )}
      {tab === "backups" && <BackupsTab />}
      {tab === "settings" && <SystemSettingsTab />}
      {tab === "status" && <SystemStatusTab />}
    </div>
  );
}
