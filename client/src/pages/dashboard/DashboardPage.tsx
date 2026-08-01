import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { SortableWidget } from "./SortableWidget";
import { AddWidgetModal } from "./AddWidgetModal";
import { DEFAULT_DASHBOARD_LAYOUT, WIDGET_CATALOG } from "./widgets";
import { Skeleton } from "../../components/Skeleton";

interface LayoutItem {
  id: string;
  cols: number;
}

export function DashboardPage() {
  const [layout, setLayout] = useState<LayoutItem[] | null>(null);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: savedLayout, isLoading } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: async () => (await axiosClient.get("/dashboard/layout")).data as LayoutItem[] | null,
  });

  useEffect(() => {
    if (!isLoading) {
      setLayout(savedLayout && savedLayout.length > 0 ? savedLayout : DEFAULT_DASHBOARD_LAYOUT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const saveLayoutMutation = useMutation({
    mutationFn: (next: LayoutItem[]) => axiosClient.put("/dashboard/layout", { layout: next }),
  });

  function updateLayout(next: LayoutItem[]) {
    setLayout(next);
    saveLayoutMutation.mutate(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!layout || !over || active.id === over.id) return;
    const oldIndex = layout.findIndex((w) => w.id === active.id);
    const newIndex = layout.findIndex((w) => w.id === over.id);
    updateLayout(arrayMove(layout, oldIndex, newIndex));
  }

  function toggleExpand(id: string) {
    if (!layout) return;
    const def = WIDGET_CATALOG.find((w) => w.id === id);
    updateLayout(layout.map((w) => (w.id === id ? { ...w, cols: w.cols >= 4 ? def?.defaultCols ?? 1 : 4 } : w)));
  }

  function removeWidget(id: string) {
    if (!layout) return;
    updateLayout(layout.filter((w) => w.id !== id));
  }

  function addWidget(id: string) {
    if (!layout) return;
    const def = WIDGET_CATALOG.find((w) => w.id === id);
    if (!def) return;
    updateLayout([...layout, { id, cols: def.defaultCols }]);
    setShowAddWidget(false);
  }

  if (!layout) {
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
      <div className="dashboard-ambient" aria-hidden="true">
        <span /><span /><span />
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Drag cards to reorder, resize, or add more widgets.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddWidget(true)}><Icon name="plus" size={14} /> Add Widget</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="widget-grid relative z-[1]">
            {layout.map((item) => {
              const def = WIDGET_CATALOG.find((w) => w.id === item.id);
              if (!def) return null;
              const Component = def.Component;
              return (
                <SortableWidget key={item.id} id={item.id} cols={item.cols} onExpandToggle={() => toggleExpand(item.id)} onRemove={() => removeWidget(item.id)}>
                  <Component />
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {showAddWidget && (
        <AddWidgetModal existingIds={layout.map((w) => w.id)} onClose={() => setShowAddWidget(false)} onAdd={addWidget} />
      )}
    </div>
  );
}
