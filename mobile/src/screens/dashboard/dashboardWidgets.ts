// Mirrors client/src/pages/dashboard/widgets.tsx's WIDGET_CATALOG for the home module — every web
// widget id maps to a section DashboardScreen.tsx already renders unconditionally, so "customizing
// a dashboard" here means choosing which of those existing sections to show, not composing a new
// drag-and-drop layout (no mobile precedent for that, same simplification as the Login Page
// Designer canvas). "kpi-devices" and "gauge-devices-online" collapse into one toggle since mobile
// renders both as a single "Devices Seen (24h)" progress row — checking it writes both ids so a
// layout created here still behaves sensibly if later opened on web.
export interface DashboardWidgetOption {
  ids: string[];
  label: string;
  cols: 1 | 2 | 4;
}

export const HOME_WIDGET_OPTIONS: DashboardWidgetOption[] = [
  { ids: ["kpi-total-assets"], label: "Total Assets", cols: 1 },
  { ids: ["kpi-open-tickets"], label: "Open Tickets", cols: 1 },
  { ids: ["kpi-low-stock"], label: "Low Stock Items", cols: 1 },
  { ids: ["kpi-docs"], label: "Docs & SOPs", cols: 1 },
  { ids: ["kpi-devices", "gauge-devices-online"], label: "Devices Seen (24h)", cols: 1 },
  { ids: ["gauge-ticket-resolution"], label: "Ticket Resolution Rate", cols: 1 },
  { ids: ["chart-assets-status"], label: "Assets by Status", cols: 2 },
  { ids: ["chart-tickets-status"], label: "Tickets by Status", cols: 2 },
  { ids: ["low-stock-list"], label: "Low Stock Items (list)", cols: 2 },
  { ids: ["offline-devices"], label: "Offline Devices", cols: 2 },
  { ids: ["maintenance-due"], label: "Maintenance Due", cols: 2 },
  { ids: ["recent-activity"], label: "Recent Activity", cols: 4 },
];

export const ALL_HOME_WIDGET_IDS = HOME_WIDGET_OPTIONS.flatMap((o) => o.ids);

export interface LayoutItem { id: string; cols: number }

// Empty/missing layout means "show everything" — mirrors ModuleDashboardTab.tsx's own fallback to
// its default catalog when layoutJson is empty.
export function visibleIdSet(layout: LayoutItem[] | null | undefined): Set<string> {
  if (!layout || layout.length === 0) return new Set(ALL_HOME_WIDGET_IDS);
  return new Set(layout.map((l) => l.id));
}

export function layoutFromSelectedOptionIds(selected: Set<number>): LayoutItem[] {
  const items: LayoutItem[] = [];
  HOME_WIDGET_OPTIONS.forEach((opt, index) => {
    if (!selected.has(index)) return;
    for (const id of opt.ids) items.push({ id, cols: opt.cols });
  });
  return items;
}

export function selectedOptionIndexesFromLayout(layout: LayoutItem[] | null | undefined): Set<number> {
  const visible = visibleIdSet(layout);
  const indexes = new Set<number>();
  HOME_WIDGET_OPTIONS.forEach((opt, index) => {
    if (opt.ids.some((id) => visible.has(id))) indexes.add(index);
  });
  return indexes;
}
