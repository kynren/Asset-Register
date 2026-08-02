import { useState } from "react";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";
import { CategoriesLocationsTab } from "./CategoriesLocationsTab";
import { AuditLogTab } from "./AuditLogTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";
import { ToastSettingsTab } from "./ToastSettingsTab";
import { useAuth } from "../../auth/AuthContext";

const TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "catalog", label: "Categories & Locations" },
  { key: "email-templates", label: "Email Templates" },
  { key: "toasts", label: "Toast Designer" },
  { key: "audit", label: "Audit Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminPage() {
  const [tab, setTab] = useState<TabKey>("users");
  const { hasPermission } = useAuth();
  const visibleTabs = TABS.filter((t) => !("module" in t) || hasPermission(t.module, "view"));

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin & Setup</h1>
          <p className="page-subtitle">Manage users, roles, categories, email templates, and the audit log.</p>
        </div>
      </div>

      <div className="row gap-2 flex-wrap">
        {visibleTabs.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "catalog" && <CategoriesLocationsTab />}
      {tab === "email-templates" && <EmailTemplatesTab />}
      {tab === "toasts" && <ToastSettingsTab />}
      {tab === "audit" && <AuditLogTab />}
    </div>
  );
}
