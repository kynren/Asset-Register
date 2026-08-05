import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ModuleDashboardTab } from "../dashboard/ModuleDashboardTab";
import { REPORTS_WIDGET_CATALOG, DEFAULT_REPORTS_DASHBOARD_LAYOUT } from "./reportsDashboardWidgets";
import { ReportsListPage } from "./ReportsListPage";
import { ReportBuilderModal } from "./ReportBuilderModal";

export function ReportsPage() {
  const [tab, setTab] = useState<"dashboard" | "reports">("reports");
  const [showBuilder, setShowBuilder] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Lets the command palette's "New Report" quick action deep-link straight into the create form.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setTab("reports");
      setShowBuilder(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Build, save, share, and export reports across every module you have access to.</p>
        </div>
        <div className="row gap-2">
          <button className={`btn btn-sm ${tab === "dashboard" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={`btn btn-sm ${tab === "reports" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("reports")}>My Reports</button>
          {tab === "reports" && (
            <PermissionGate module="reports" action="create">
              <button className="btn btn-primary" onClick={() => setShowBuilder(true)}><Icon name="plus" size={14} /> New Report</button>
            </PermissionGate>
          )}
        </div>
      </div>

      {tab === "reports" ? (
        <ReportsListPage />
      ) : (
        <ModuleDashboardTab
          module="reports"
          catalog={REPORTS_WIDGET_CATALOG}
          defaultLayout={DEFAULT_REPORTS_DASHBOARD_LAYOUT}
          title="Reports"
          showHeader={false}
        />
      )}

      {showBuilder && <ReportBuilderModal onClose={() => setShowBuilder(false)} />}
    </div>
  );
}
