import { useState } from "react";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";
import { TeamsTab } from "./TeamsTab";
import { EmailIngestSettingsTab } from "./EmailIngestSettingsTab";
import { CategoriesLocationsTab } from "./CategoriesLocationsTab";
import { AuditLogTab } from "./AuditLogTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";
import { ToastSettingsTab } from "./ToastSettingsTab";
import { HelpdeskConfigTab } from "./HelpdeskConfigTab";
import { AutomationRulesTab } from "./AutomationRulesTab";
import { BrandingTab } from "../appSettings/BrandingTab";
import { DocsImportLimitCard } from "../docs/DocsImportLimitCard";

const TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "teams", label: "Teams" },
  { key: "catalog", label: "Categories & Locations" },
  { key: "helpdesk-config", label: "Helpdesk Config" },
  { key: "automation-rules", label: "Automation Rules" },
  { key: "email-ingest", label: "Email Ingestion" },
  { key: "email-templates", label: "Email Templates" },
  { key: "toasts", label: "Toast Designer" },
  { key: "branding", label: "Branding" },
  { key: "docs-settings", label: "Docs & SOPs" },
  { key: "audit", label: "Audit Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminPage() {
  const [tab, setTab] = useState<TabKey>("users");

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Admin & Setup</h1>
            <p className="page-subtitle">Manage users, roles, categories, email templates, and the audit log.</p>
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

      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "teams" && <TeamsTab />}
      {tab === "catalog" && <CategoriesLocationsTab />}
      {tab === "helpdesk-config" && <HelpdeskConfigTab />}
      {tab === "automation-rules" && <AutomationRulesTab />}
      {tab === "email-ingest" && <EmailIngestSettingsTab />}
      {tab === "email-templates" && <EmailTemplatesTab />}
      {tab === "toasts" && <ToastSettingsTab />}
      {tab === "branding" && <BrandingTab />}
      {tab === "docs-settings" && <DocsImportLimitCard />}
      {tab === "audit" && <AuditLogTab />}
    </div>
  );
}
