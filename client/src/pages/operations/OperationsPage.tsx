import { useState } from "react";
import { Icon } from "../../components/Icon";
import { ProjectsTab } from "./tabs/ProjectsTab";
import { RssFeedTab } from "./tabs/RssFeedTab";
import { KnowledgeBaseTab } from "./tabs/KnowledgeBaseTab";
import { AssetBookingsTab } from "./tabs/AssetBookingsTab";
import { SavedQueriesTab } from "./tabs/SavedQueriesTab";
import { ResourceSchedulingTab } from "./tabs/ResourceSchedulingTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { LegacyToolsTab } from "./tabs/LegacyToolsTab";
import { LicensesTab } from "./tabs/LicensesTab";

type TabKey = "projects" | "rss" | "knowledge" | "bookings" | "queries" | "scheduling" | "timeline" | "licenses" | "legacy";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "projects", label: "IT Projects", icon: "kanban" },
  { key: "rss", label: "Live RSS Feed", icon: "rss" },
  { key: "knowledge", label: "Knowledge Base", icon: "book" },
  { key: "bookings", label: "Asset Bookings", icon: "calendar" },
  { key: "queries", label: "Saved Queries", icon: "bookmark" },
  { key: "scheduling", label: "Resource Scheduling", icon: "clock" },
  { key: "timeline", label: "Timeline", icon: "sliders" },
  { key: "licenses", label: "Software Licenses", icon: "key" },
  { key: "legacy", label: "Bulk & Reports", icon: "settings" },
];

export function OperationsPage() {
  const [tab, setTab] = useState<TabKey>("projects");

  return (
    <div className="ad-shell ot-shell">
      <div className="ot-header">
        <div className="ot-header-top">
          <div className="ot-header-icon"><Icon name="wrench" size={18} /></div>
          <div>
            <h1 className="ot-header-title">Showground Operational Tools</h1>
            <p className="ot-header-subtitle">Launch secondary support workflows including IT scheduling, knowledge base, reservations, and query bookmarking.</p>
          </div>
        </div>
        <div className="ot-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`ot-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ot-body">
        {tab === "projects" && <ProjectsTab />}
        {tab === "rss" && <RssFeedTab />}
        {tab === "knowledge" && <KnowledgeBaseTab />}
        {tab === "bookings" && <AssetBookingsTab />}
        {tab === "queries" && <SavedQueriesTab />}
        {tab === "scheduling" && <ResourceSchedulingTab />}
        {tab === "timeline" && <TimelineTab />}
        {tab === "licenses" && <LicensesTab />}
        {tab === "legacy" && <LegacyToolsTab />}
      </div>
    </div>
  );
}
