import { ModuleDashboardTab } from "./ModuleDashboardTab";
import { DEFAULT_DASHBOARD_LAYOUT, WIDGET_CATALOG } from "./widgets";

export function DashboardPage() {
  return (
    <ModuleDashboardTab
      module="home"
      catalog={WIDGET_CATALOG}
      defaultLayout={DEFAULT_DASHBOARD_LAYOUT}
      title="Dashboard"
      subtitle="Drag cards to reorder, resize, or add more widgets."
    />
  );
}
