import { useState } from "react";
import { OrganizationsTab } from "./OrganizationsTab";
import { BackupsTab } from "./BackupsTab";
import { SystemSettingsTab } from "./SystemSettingsTab";
import { SystemStatusTab } from "./SystemStatusTab";
import { ChangeManagementTab } from "./ChangeManagementTab";
import { AgentLogTab } from "./AgentLogTab";
import { RolesTab } from "../admin/RolesTab";
import { UsersTab } from "../admin/UsersTab";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../auth/AuthContext";
import { CHANGE_TYPE_INFO, ScheduledChangeRow } from "./scheduledChangeTypes";

const TABS = [
  { key: "organizations", label: "Organizations" },
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "backups", label: "Backups" },
  { key: "settings", label: "System Settings" },
  { key: "status", label: "System Status" },
  { key: "changeManagement", label: "Change Management" },
  { key: "agentLog", label: "Agent Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AppSettingsPage() {
  const [tab, setTab] = useState<TabKey>("organizations");
  const { organization, isOrgSwitchConfirmed } = useAuth();

  // Driven by the server-confirmed org-switch state on the caller's own refresh session (see
  // AuthContext's isOrgSwitchConfirmed + appSettings.controller.ts's switchOrganization) rather
  // than local component state — a real password/PIN re-verification, not just "has this
  // component been mounted before."
  const orgConfirmed = organization ? isOrgSwitchConfirmed(organization.id) : false;

  // Set when "Edit" is clicked on a pending scheduled change in Change Management — routes the
  // admin to the tab the change came from, with that tab's form seeded from the change's payload
  // instead of live data, and its Save button re-targeted at PATCHing this same change.
  const [editingChange, setEditingChange] = useState<ScheduledChangeRow | null>(null);

  function handleChangeOrganization() {
    setEditingChange(null);
    setTab("organizations");
  }

  function handleEditScheduledChange(change: ScheduledChangeRow) {
    setEditingChange(change);
    setTab(CHANGE_TYPE_INFO[change.changeType].tab);
  }

  function handleTabClick(key: TabKey) {
    if (!orgConfirmed && key !== "organizations") return;
    if (key !== CHANGE_TYPE_INFO.SYSTEM_SETTINGS.tab && key !== CHANGE_TYPE_INFO.BACKUP_SETTINGS.tab && key !== CHANGE_TYPE_INFO.ROLE_PERMISSIONS.tab) {
      setEditingChange(null);
    }
    setTab(key);
  }

  const activeTab: TabKey = orgConfirmed ? tab : "organizations";

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">App Settings</h1>
            <p className="page-subtitle">Platform-level administration — organizations, backups, and system-wide settings. Visible only to System Admin.</p>
          </div>
          {orgConfirmed && organization && (
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Organization: <strong style={{ color: "var(--color-text)" }}>{organization.name}</strong>
              </span>
              <button className="btn btn-secondary btn-sm" onClick={handleChangeOrganization}>
                <Icon name="refresh" size={12} /> Change
              </button>
            </div>
          )}
        </div>

        <div className="row gap-2 flex-wrap">
          {TABS.map((t) => {
            const disabled = !orgConfirmed && t.key !== "organizations";
            return (
              <button
                key={t.key}
                className={`btn btn-sm ${activeTab === t.key ? "btn-primary" : "btn-secondary"}`}
                disabled={disabled}
                title={disabled ? "Select an organization first" : undefined}
                onClick={() => handleTabClick(t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "organizations" && <OrganizationsTab strictActiveDisable={orgConfirmed} />}
      {activeTab === "users" && (
        <div className="stack gap-3">
          <p className="muted" style={{ margin: 0 }}>
            Managing users for <strong>{organization?.name ?? "the current organization"}</strong>.
          </p>
          <UsersTab />
        </div>
      )}
      {activeTab === "roles" && (
        <div className="stack gap-3">
          <p className="muted" style={{ margin: 0 }}>
            Editing roles for <strong>{organization?.name ?? "the current organization"}</strong>.
          </p>
          <RolesTab
            enableScheduling
            editingScheduledChange={editingChange?.changeType === "ROLE_PERMISSIONS" ? editingChange : null}
            onDoneEditingScheduledChange={() => setEditingChange(null)}
          />
        </div>
      )}
      {activeTab === "backups" && (
        <BackupsTab
          editingScheduledChange={editingChange?.changeType === "BACKUP_SETTINGS" ? editingChange : null}
          onDoneEditingScheduledChange={() => setEditingChange(null)}
        />
      )}
      {activeTab === "settings" && (
        <SystemSettingsTab
          editingScheduledChange={editingChange?.changeType === "SYSTEM_SETTINGS" ? editingChange : null}
          onDoneEditingScheduledChange={() => setEditingChange(null)}
        />
      )}
      {activeTab === "status" && <SystemStatusTab />}
      {activeTab === "changeManagement" && <ChangeManagementTab onEdit={handleEditScheduledChange} />}
      {activeTab === "agentLog" && <AgentLogTab />}
    </div>
  );
}
