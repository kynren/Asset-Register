import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { SortableWidget } from "./SortableWidget";
import { AddWidgetModal } from "./AddWidgetModal";
import { WidgetDef } from "./widgets";
import { Skeleton } from "../../components/Skeleton";
import { CustomQueryConfig, CustomQueryConfigModal } from "./CustomQueryConfigModal";
import { CustomQueryWidget } from "./CustomQueryWidget";
import { ComparisonQueryConfig, ComparisonConfigModal } from "./ComparisonConfigModal";
import { ComparisonWidget } from "./ComparisonWidget";
import { WidgetFilterModal } from "./WidgetFilterModal";
import { getSource } from "./dataExplorerConfig";
import { DashboardPickerBar, DashboardSummary } from "./DashboardPickerBar";
import { ShareDashboardModal } from "./ShareDashboardModal";
import { SharedWithMeModal } from "./SharedWithMeModal";
import { OnboardingTour } from "../../components/OnboardingTour";

const DASHBOARD_TOUR_STEPS = [
  {
    target: '[data-tour="dashboard-add-widget"]',
    title: "Customize your layout",
    description: "Drag widgets to reorder them, use the size toggle to resize, or remove ones you don't need. Click here to add more.",
  },
  {
    target: '[data-tour="dashboard-new-btn"]',
    title: "Multiple dashboards",
    description: "Create separate dashboard layouts for different needs, then rename, share, or set one as your default.",
  },
];

interface LayoutItem {
  id: string;
  cols: number;
  // Only set on "custom-*" widgets (the home dashboard's ad-hoc query builder) or on
  // module-dashboard catalog widgets a user has narrowed with "Configure filters".
  config?: CustomQueryConfig;
  // Only set on "comparison-*" widgets (the home dashboard's cross-module comparison chart).
  comparisonConfig?: ComparisonQueryConfig;
  filters?: Record<string, string>;
}

interface DashboardDetail {
  id: number;
  name: string;
  module: string;
  layoutJson: LayoutItem[];
  isOwner: boolean;
  canEdit: boolean;
}

// Maps a module dashboard to the data-explorer source whose field registry drives that module's
// per-widget filter panel — the home dashboard has no entry since it uses the full query builder
// (a different source per custom widget) instead of one fixed source.
const MODULE_SOURCE: Record<string, string> = {
  assets: "assets",
  helpdesk: "tickets",
  stock: "stock",
  network: "network",
  docs: "docs",
};

// Shared drag-and-drop/persistence harness behind every dashboard in the app. A module can now
// have any number of named, ownable, shareable dashboards (see server Dashboard/DashboardShare
// models) — this component tracks which one is active, fetches/saves its layout, and renders it
// read-only when the caller only has view (not edit) access via a share.
export function ModuleDashboardTab({
  module,
  catalog,
  defaultLayout,
  title,
  subtitle = "Drag cards to reorder, resize, or add more widgets.",
  showHeader = true,
}: {
  module: string;
  catalog: WidgetDef[];
  defaultLayout: LayoutItem[];
  title: string;
  subtitle?: string;
  /** The home Dashboard is a standalone route with no page title of its own, so it renders a full
   * h1 header here. Embedded module dashboards (Assets/Helpdesk/Stock/Network/Docs) sit inside a
   * page that already has its own title + tab bar, so they skip the header and show just the
   * subtitle + Add Widget button. */
  showHeader?: boolean;
}) {
  const [dashboardId, setDashboardId] = useState<number | null>(null);
  const [layout, setLayout] = useState<LayoutItem[] | null>(null);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showCustomQueryModal, setShowCustomQueryModal] = useState(false);
  const [editingCustomWidgetId, setEditingCustomWidgetId] = useState<string | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [editingComparisonWidgetId, setEditingComparisonWidgetId] = useState<string | null>(null);
  const [filteringWidgetId, setFilteringWidgetId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSharedWithMeModal, setShowSharedWithMeModal] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const filterSource = MODULE_SOURCE[module] ? getSource(MODULE_SOURCE[module]) : undefined;
  const queryClient = useQueryClient();

  const { data: defaultDashboard } = useQuery({
    queryKey: ["dashboard-default", module],
    queryFn: async () => (await axiosClient.get("/dashboard/dashboards/default", { params: { module } })).data as DashboardDetail,
  });

  useEffect(() => {
    if (defaultDashboard && dashboardId == null) setDashboardId(defaultDashboard.id);
  }, [defaultDashboard, dashboardId]);

  const { data: dashboardsList } = useQuery({
    queryKey: ["dashboards-list", module],
    queryFn: async () => (await axiosClient.get("/dashboard/dashboards", { params: { module } })).data as DashboardSummary[],
  });

  const { data: sharedWithMe } = useQuery({
    queryKey: ["dashboards-shared-with-me", module],
    queryFn: async () => (await axiosClient.get("/dashboard/dashboards/shared-with-me", { params: { module } })).data as DashboardSummary[],
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["dashboard-detail", dashboardId],
    queryFn: async () => (await axiosClient.get(`/dashboard/dashboards/${dashboardId}/layout`)).data as DashboardDetail,
    enabled: dashboardId != null,
  });

  useEffect(() => {
    if (detail) setLayout(detail.layoutJson && detail.layoutJson.length > 0 ? detail.layoutJson : defaultLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const canEdit = detail?.canEdit ?? true;

  function invalidateLists() {
    queryClient.invalidateQueries({ queryKey: ["dashboards-list", module] });
    queryClient.invalidateQueries({ queryKey: ["dashboards-shared-with-me", module] });
  }

  const saveLayoutMutation = useMutation({
    mutationFn: (next: LayoutItem[]) => axiosClient.put(`/dashboard/dashboards/${dashboardId}/layout`, { layout: next }),
  });

  function updateLayout(next: LayoutItem[]) {
    if (!canEdit || dashboardId == null) return;
    setLayout(next);
    saveLayoutMutation.mutate(next);
  }

  const createDashboardMutation = useMutation({
    mutationFn: (name: string) => axiosClient.post("/dashboard/dashboards", { name, module }),
    meta: { successMessage: "Dashboard created" },
    onSuccess: (res) => { invalidateLists(); setDashboardId(res.data.id); },
  });

  const renameDashboardMutation = useMutation({
    mutationFn: (name: string) => axiosClient.patch(`/dashboard/dashboards/${dashboardId}`, { name }),
    onSuccess: () => { invalidateLists(); queryClient.invalidateQueries({ queryKey: ["dashboard-detail", dashboardId] }); },
  });

  const setDefaultMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/dashboard/dashboards/${dashboardId}`, { isDefault: true }),
    onSuccess: () => invalidateLists(),
  });

  const deleteDashboardMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/dashboard/dashboards/${dashboardId}`),
    meta: { successMessage: "Dashboard deleted" },
    onSuccess: async () => {
      invalidateLists();
      const res = await axiosClient.get("/dashboard/dashboards/default", { params: { module } });
      setDashboardId(res.data.id);
    },
  });

  const duplicateDashboardMutation = useMutation({
    mutationFn: () => axiosClient.post(`/dashboard/dashboards/${dashboardId}/duplicate`),
    meta: { successMessage: "Dashboard duplicated" },
    onSuccess: (res) => { invalidateLists(); setDashboardId(res.data.id); },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!layout || !over || active.id === over.id) return;
    const oldIndex = layout.findIndex((w) => w.id === active.id);
    const newIndex = layout.findIndex((w) => w.id === over.id);
    updateLayout(arrayMove(layout, oldIndex, newIndex));
  }

  function toggleExpand(id: string) {
    if (!layout) return;
    const def = catalog.find((w) => w.id === id);
    updateLayout(layout.map((w) => (w.id === id ? { ...w, cols: w.cols >= 4 ? def?.defaultCols ?? 1 : 4 } : w)));
  }

  function removeWidget(id: string) {
    if (!layout) return;
    updateLayout(layout.filter((w) => w.id !== id));
  }

  function addWidget(id: string) {
    if (!layout) return;
    const def = catalog.find((w) => w.id === id);
    if (!def) return;
    updateLayout([...layout, { id, cols: def.defaultCols }]);
    setShowAddWidget(false);
  }

  function addCustomWidget(config: CustomQueryConfig) {
    if (!layout) return;
    const cols = config.visualization === "table" ? 4 : config.visualization === "kpi" ? 1 : 2;
    updateLayout([...layout, { id: `custom-${Date.now()}`, cols, config }]);
    setShowAddWidget(false);
    setShowCustomQueryModal(false);
  }

  function saveCustomWidgetConfig(id: string, config: CustomQueryConfig) {
    if (!layout) return;
    updateLayout(layout.map((w) => (w.id === id ? { ...w, config } : w)));
    setEditingCustomWidgetId(null);
  }

  function addComparisonWidget(comparisonConfig: ComparisonQueryConfig) {
    if (!layout) return;
    updateLayout([...layout, { id: `comparison-${Date.now()}`, cols: 2, comparisonConfig }]);
    setShowAddWidget(false);
    setShowComparisonModal(false);
  }

  function saveComparisonWidgetConfig(id: string, comparisonConfig: ComparisonQueryConfig) {
    if (!layout) return;
    updateLayout(layout.map((w) => (w.id === id ? { ...w, comparisonConfig } : w)));
    setEditingComparisonWidgetId(null);
  }

  function saveWidgetFilters(id: string, filters: Record<string, string>) {
    if (!layout) return;
    updateLayout(layout.map((w) => (w.id === id ? { ...w, filters } : w)));
    setFilteringWidgetId(null);
  }

  function renderWidgetBody(item: LayoutItem) {
    if (item.id.startsWith("custom-")) {
      if (!item.config) return null;
      return <CustomQueryWidget config={item.config} />;
    }
    if (item.id.startsWith("comparison-")) {
      if (!item.comparisonConfig) return null;
      return <ComparisonWidget config={item.comparisonConfig} />;
    }
    const def = catalog.find((w) => w.id === item.id);
    if (!def) return null;
    const Component = def.Component;
    return <Component filters={item.filters} />;
  }

  if (!layout || dashboardId == null || detailLoading) {
    return (
      <div className="stack gap-3">
        <div className="grid grid-cols-4" style={{ gap: 14 }}>
          <Skeleton height={80} /><Skeleton height={80} /><Skeleton height={80} /><Skeleton height={80} />
        </div>
        <div className="grid grid-cols-2" style={{ gap: 14 }}>
          <Skeleton height={220} /><Skeleton height={220} />
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-3 relative">
      {showHeader ? (
        <div className="dashboard-ambient" aria-hidden="true">
          <span /><span /><span />
        </div>
      ) : null}

      <div className="page-header" style={showHeader ? undefined : { padding: 0 }}>
        {showHeader ? (
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{subtitle}</p>
        )}
        {canEdit && (
          <button className="btn btn-primary" data-tour="dashboard-add-widget" onClick={() => setShowAddWidget(true)}><Icon name="plus" size={14} /> Add Widget</button>
        )}
      </div>

      {module === "home" && canEdit && <OnboardingTour storageKey="onboarding.dashboardTourSeen" steps={DASHBOARD_TOUR_STEPS} />}

      <DashboardPickerBar
        dashboards={dashboardsList ?? []}
        activeId={dashboardId}
        onSelect={setDashboardId}
        onCreate={(name) => createDashboardMutation.mutate(name)}
        onRename={(name) => renameDashboardMutation.mutate(name)}
        onSetDefault={() => setDefaultMutation.mutate()}
        onDuplicate={() => duplicateDashboardMutation.mutate()}
        onDelete={() => deleteDashboardMutation.mutate()}
        onShare={() => setShowShareModal(true)}
        onShowSharedWithMe={() => setShowSharedWithMeModal(true)}
        sharedWithMeCount={sharedWithMe?.length ?? 0}
      />

      {!canEdit && (
        <div className="alert alert-primary" style={{ fontSize: 13 }}>
          <Icon name="eye" size={13} /> Shared with you (view only) — use Duplicate to make your own editable copy.
        </div>
      )}

      {canEdit ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="widget-grid relative z-[1]">
              {layout.map((item) => {
                const body = renderWidgetBody(item);
                if (!body) return null;
                const isCustom = item.id.startsWith("custom-");
                const isComparison = item.id.startsWith("comparison-");
                return (
                  <SortableWidget
                    key={item.id}
                    id={item.id}
                    cols={item.cols}
                    onExpandToggle={() => toggleExpand(item.id)}
                    onRemove={() => removeWidget(item.id)}
                    onConfigure={
                      isCustom
                        ? () => setEditingCustomWidgetId(item.id)
                        : isComparison
                          ? () => setEditingComparisonWidgetId(item.id)
                          : filterSource
                            ? () => setFilteringWidgetId(item.id)
                            : undefined
                    }
                    configureActive={
                      isCustom
                        ? (item.config?.conditions.length ?? 0) > 0
                        : isComparison
                          ? (item.comparisonConfig?.sources.length ?? 0) > 0
                          : Boolean(item.filters && Object.keys(item.filters).length > 0)
                    }
                  >
                    {body}
                  </SortableWidget>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="widget-grid relative z-[1]">
          {layout.map((item) => {
            const body = renderWidgetBody(item);
            if (!body) return null;
            return (
              <div key={item.id} className="card widget-card" style={{ gridColumn: `span ${item.cols}` }}>
                {body}
              </div>
            );
          })}
        </div>
      )}

      {showAddWidget && (
        <AddWidgetModal
          existingIds={layout.filter((w) => !w.id.startsWith("custom-")).map((w) => w.id)}
          catalog={catalog}
          onClose={() => setShowAddWidget(false)}
          onAdd={addWidget}
          onAddCustomQuery={module === "home" ? () => setShowCustomQueryModal(true) : undefined}
          onAddComparison={module === "home" ? () => setShowComparisonModal(true) : undefined}
        />
      )}

      {showCustomQueryModal && <CustomQueryConfigModal onClose={() => setShowCustomQueryModal(false)} onSave={addCustomWidget} />}

      {editingCustomWidgetId && (
        <CustomQueryConfigModal
          initial={layout.find((w) => w.id === editingCustomWidgetId)?.config}
          onClose={() => setEditingCustomWidgetId(null)}
          onSave={(config) => saveCustomWidgetConfig(editingCustomWidgetId, config)}
        />
      )}

      {showComparisonModal && <ComparisonConfigModal onClose={() => setShowComparisonModal(false)} onSave={addComparisonWidget} />}

      {editingComparisonWidgetId && (
        <ComparisonConfigModal
          initial={layout.find((w) => w.id === editingComparisonWidgetId)?.comparisonConfig}
          onClose={() => setEditingComparisonWidgetId(null)}
          onSave={(config) => saveComparisonWidgetConfig(editingComparisonWidgetId, config)}
        />
      )}

      {filteringWidgetId && filterSource && (
        <WidgetFilterModal
          fields={filterSource.fields}
          initial={layout.find((w) => w.id === filteringWidgetId)?.filters ?? {}}
          onClose={() => setFilteringWidgetId(null)}
          onSave={(filters) => saveWidgetFilters(filteringWidgetId, filters)}
        />
      )}

      {showShareModal && detail && (
        <ShareDashboardModal dashboardId={dashboardId} dashboardName={detail.name} onClose={() => setShowShareModal(false)} />
      )}

      {showSharedWithMeModal && (
        <SharedWithMeModal
          module={module}
          onClose={() => setShowSharedWithMeModal(false)}
          onOpen={(id) => { setDashboardId(id); setShowSharedWithMeModal(false); }}
        />
      )}
    </div>
  );
}
