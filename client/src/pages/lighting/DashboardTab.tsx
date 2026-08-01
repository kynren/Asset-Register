import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { LightingDevice } from "./LightingDeviceCard";

interface LightingGroup {
  id: number;
  name: string;
  icon: string | null;
  sortOrder: number;
}

const ICON_CHOICES = ["bulb", "home", "layers", "cpu", "star", "diamond", "sun", "moon", "wifi", "plug", "gauge", "briefcase", "camera", "mapPin", "grid", "bookmark"];

const UNGROUPED_DROP_ID = "ungrouped-drop";

export function DashboardTab() {
  const [addingGroup, setAddingGroup] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState<LightingGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<LightingGroup | null>(null);
  const [pickingIconFor, setPickingIconFor] = useState<{ kind: "group" | "device"; id: number; current: string | null } | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["lighting-groups"],
    queryFn: async () => (await axiosClient.get("/lighting/groups")).data as LightingGroup[],
  });
  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[],
  });

  function invalidateGroups() {
    queryClient.invalidateQueries({ queryKey: ["lighting-groups"] });
  }
  function invalidateDevices() {
    queryClient.invalidateQueries({ queryKey: ["lighting-devices"] });
  }

  const moveMutation = useMutation({
    mutationFn: ({ deviceId, groupId }: { deviceId: number; groupId: number | null }) => axiosClient.patch(`/lighting/devices/${deviceId}/move`, { groupId }),
    onSuccess: invalidateDevices,
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: (ids: number[]) => axiosClient.post("/lighting/groups/reorder", { ids }),
    onSuccess: invalidateGroups,
  });

  const deviceIconMutation = useMutation({
    mutationFn: ({ deviceId, icon }: { deviceId: number; icon: string | null }) => axiosClient.patch(`/lighting/devices/${deviceId}/icon`, { icon }),
    onSuccess: () => { invalidateDevices(); setPickingIconFor(null); },
  });

  const groupIconMutation = useMutation({
    mutationFn: ({ groupId, icon }: { groupId: number; icon: string | null }) => axiosClient.patch(`/lighting/groups/${groupId}`, { icon }),
    onSuccess: () => { invalidateGroups(); setPickingIconFor(null); },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/groups/${id}`),
    onSuccess: () => { invalidateGroups(); invalidateDevices(); setDeletingGroup(null); },
  });

  const powerMutation = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => axiosClient.post(`/lighting/devices/${id}/power`, { on }),
    onSuccess: invalidateDevices,
  });

  const devicesByGroup = useMemo(() => {
    const map = new Map<number | null, LightingDevice[]>();
    for (const d of devices ?? []) {
      const key = d.groupId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [devices]);

  const sortedGroups = useMemo(() => [...(groups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [groups]);
  const ungroupedDevices = devicesByGroup.get(null) ?? [];
  const activeDevice = devices?.find((d) => d.id === activeDeviceId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type?: string; deviceId?: number } | undefined;
    if (data?.type === "device" && data.deviceId) setActiveDeviceId(data.deviceId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeviceId(null);
    if (!over) return;

    const activeData = active.data.current as { type?: string; deviceId?: number } | undefined;
    if (activeData?.type === "device" && activeData.deviceId) {
      const overId = String(over.id);
      let targetGroupId: number | null | undefined;
      if (overId === UNGROUPED_DROP_ID) targetGroupId = null;
      else if (overId.startsWith("group-drop-")) targetGroupId = Number(overId.replace("group-drop-", ""));
      if (targetGroupId !== undefined) {
        const device = devices?.find((d) => d.id === activeData.deviceId);
        if (device && device.groupId !== targetGroupId) moveMutation.mutate({ deviceId: activeData.deviceId, groupId: targetGroupId });
      }
      return;
    }

    // Otherwise this was a group-card drag (card ids are "group-<id>") — reorder.
    if (String(active.id).startsWith("group-") && String(over.id).startsWith("group-") && active.id !== over.id) {
      const ids = sortedGroups.map((g) => g.id);
      const oldIndex = sortedGroups.findIndex((g) => `group-${g.id}` === active.id);
      const newIndex = sortedGroups.findIndex((g) => `group-${g.id}` === over.id);
      if (oldIndex !== -1 && newIndex !== -1) reorderGroupsMutation.mutate(arrayMove(ids, oldIndex, newIndex));
    }
  }

  const isLoading = groupsLoading || devicesLoading;

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
        <PermissionGate module="lighting" action="create">
          <button className="btn btn-primary" onClick={() => setAddingGroup(true)}><Icon name="plus" size={14} /> Add Group</button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <Skeleton height={160} /><Skeleton height={160} /><Skeleton height={160} />
        </div>
      )}

      {!isLoading && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedGroups.map((g) => `group-${g.id}`)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-3">
              {sortedGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  devices={devicesByGroup.get(group.id) ?? []}
                  onToggleDevice={(id, on) => powerMutation.mutate({ id, on })}
                  onPickIcon={(current) => setPickingIconFor({ kind: "group", id: group.id, current })}
                  onPickDeviceIcon={(deviceId, current) => setPickingIconFor({ kind: "device", id: deviceId, current })}
                  onRename={() => setRenamingGroup(group)}
                  onDelete={() => setDeletingGroup(group)}
                />
              ))}
            </div>
          </SortableContext>

          <UngroupedCard
            devices={ungroupedDevices}
            onToggleDevice={(id, on) => powerMutation.mutate({ id, on })}
            onPickDeviceIcon={(deviceId, current) => setPickingIconFor({ kind: "device", id: deviceId, current })}
          />

          <DragOverlay>
            {activeDevice && (
              <div className="card" style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <Icon name={activeDevice.icon ?? (activeDevice.kind === "LIGHT" ? "bulb" : "plug")} size={14} />
                <span style={{ fontSize: 12 }}>{activeDevice.name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {!isLoading && sortedGroups.length === 0 && ungroupedDevices.length === 0 && (
        <div className="empty-state card">No lighting devices yet — add one under the Devices tab, then group it here.</div>
      )}

      {(addingGroup || renamingGroup) && (
        <GroupFormModal
          group={renamingGroup}
          onClose={() => { setAddingGroup(false); setRenamingGroup(null); }}
          onSaved={invalidateGroups}
        />
      )}

      {pickingIconFor && (
        <FormModal title="Choose an Icon" onClose={() => setPickingIconFor(null)} hideFooter>
          <div className="row gap-2 flex-wrap">
            {ICON_CHOICES.map((name) => (
              <button
                key={name}
                className="btn btn-secondary btn-icon"
                style={{ width: 40, height: 40, border: pickingIconFor.current === name ? "2px solid var(--color-primary)" : undefined }}
                onClick={() =>
                  pickingIconFor.kind === "group"
                    ? groupIconMutation.mutate({ groupId: pickingIconFor.id, icon: name })
                    : deviceIconMutation.mutate({ deviceId: pickingIconFor.id, icon: name })
                }
              >
                <Icon name={name} size={18} />
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() =>
              pickingIconFor.kind === "group"
                ? groupIconMutation.mutate({ groupId: pickingIconFor.id, icon: null })
                : deviceIconMutation.mutate({ deviceId: pickingIconFor.id, icon: null })
            }
          >
            Use Default
          </button>
        </FormModal>
      )}

      {deletingGroup && (
        <ConfirmDialog
          title="Delete group"
          message={`Delete "${deletingGroup.name}"? Its devices are kept, just ungrouped. This cannot be undone.`}
          danger
          loading={deleteGroupMutation.isPending}
          onCancel={() => setDeletingGroup(null)}
          onConfirm={() => deleteGroupMutation.mutate(deletingGroup.id)}
        />
      )}
    </div>
  );
}

function DeviceChip({ device, onToggle, onPickIcon }: { device: LightingDevice; onToggle: (on: boolean) => void; onPickIcon: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `device-${device.id}`, data: { type: "device", deviceId: device.id } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="row gap-2"
      style={{
        alignItems: "center", padding: "6px 8px", borderRadius: 8, cursor: "grab", opacity: isDragging ? 0.4 : 1,
        background: "var(--color-surface-muted, rgba(127,127,127,0.08))", transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onPickIcon(); }} title="Change icon">
        <Icon name={device.icon ?? (device.kind === "LIGHT" ? "bulb" : "plug")} size={14} />
      </button>
      <span style={{ fontSize: 12, flex: 1 }}>{device.name}</span>
      <label className="form-toggle-switch" style={{ cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={device.isOn} disabled={device.status === "OFFLINE"} onChange={(e) => onToggle(e.target.checked)} />
        <span className="form-toggle-switch-track" />
      </label>
    </div>
  );
}

function GroupCard({
  group,
  devices,
  onToggleDevice,
  onPickIcon,
  onPickDeviceIcon,
  onRename,
  onDelete,
}: {
  group: LightingGroup;
  devices: LightingDevice[];
  onToggleDevice: (id: number, on: boolean) => void;
  onPickIcon: (current: string | null) => void;
  onPickDeviceIcon: (deviceId: number, current: string | null) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const sortable = useSortable({ id: `group-${group.id}` });
  const droppable = useDroppable({ id: `group-drop-${group.id}` });
  const style = { transform: sortable.transform ? CSS.Transform.toString(sortable.transform) : undefined, transition: sortable.transition };

  return (
    <div ref={sortable.setNodeRef} style={style} className="card">
      <div className="row gap-2" {...sortable.attributes} {...sortable.listeners} style={{ justifyContent: "space-between", alignItems: "center", cursor: "grab", marginBottom: 8 }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onPickIcon(group.icon); }} title="Change icon" onPointerDown={(e) => e.stopPropagation()}>
            <Icon name={group.icon ?? "layers"} size={16} />
          </button>
          <strong style={{ fontSize: 13 }}>{group.name}</strong>
        </div>
        <div className="row gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <PermissionGate module="lighting" action="edit">
            <button className="btn-icon" onClick={onRename} title="Rename"><Icon name="edit" size={12} /></button>
          </PermissionGate>
          <PermissionGate module="lighting" action="delete">
            <button className="btn-icon" onClick={onDelete} title="Delete"><Icon name="trash" size={12} /></button>
          </PermissionGate>
        </div>
      </div>
      <div ref={droppable.setNodeRef} className="stack gap-1" style={{ minHeight: 48, borderRadius: 8, background: droppable.isOver ? "var(--color-primary-soft)" : undefined, padding: droppable.isOver ? 4 : 0 }}>
        {devices.length === 0 && <p className="muted" style={{ fontSize: 11, textAlign: "center", padding: "8px 0" }}>Drop a light here</p>}
        {devices.map((d) => (
          <DeviceChip key={d.id} device={d} onToggle={(on) => onToggleDevice(d.id, on)} onPickIcon={() => onPickDeviceIcon(d.id, d.icon)} />
        ))}
      </div>
    </div>
  );
}

function UngroupedCard({
  devices,
  onToggleDevice,
  onPickDeviceIcon,
}: {
  devices: LightingDevice[];
  onToggleDevice: (id: number, on: boolean) => void;
  onPickDeviceIcon: (deviceId: number, current: string | null) => void;
}) {
  const droppable = useDroppable({ id: UNGROUPED_DROP_ID });
  if (devices.length === 0) return null;
  return (
    <div className="card">
      <strong style={{ fontSize: 13 }}>Ungrouped</strong>
      <div ref={droppable.setNodeRef} className="stack gap-1" style={{ marginTop: 8, minHeight: 48, borderRadius: 8, background: droppable.isOver ? "var(--color-primary-soft)" : undefined, padding: droppable.isOver ? 4 : 0 }}>
        {devices.map((d) => (
          <DeviceChip key={d.id} device={d} onToggle={(on) => onToggleDevice(d.id, on)} onPickIcon={() => onPickDeviceIcon(d.id, d.icon)} />
        ))}
      </div>
    </div>
  );
}

function GroupFormModal({ group, onClose, onSaved }: { group: LightingGroup | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const mutation = useMutation({
    mutationFn: () => (group ? axiosClient.patch(`/lighting/groups/${group.id}`, { name }) : axiosClient.post("/lighting/groups", { name })),
    onSuccess: () => { onSaved(); onClose(); },
  });
  return (
    <FormModal title={group ? "Rename Group" : "Add Group"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()}>
      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen, Living Room" autoFocus /></div>
    </FormModal>
  );
}
