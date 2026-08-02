import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { KpiCard } from "../../components/KpiCard";
import { RadialGauge } from "../../components/RadialGauge";
import { SimpleBarChart } from "../../components/ChartWrapper";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { LightingDevice } from "./LightingDeviceCard";
import { LightingDeviceTile } from "./LightingDeviceTile";
import { DeviceFormModal } from "./DeviceFormModal";

interface SceneAction {
  id: number;
  deviceId: number;
  turnOn: boolean;
  brightness: number | null;
  device: { id: number; name: string };
}
interface LightingScene {
  id: number;
  name: string;
  icon: string | null;
  actions: SceneAction[];
}

interface LightingGroup {
  id: number;
  name: string;
  icon: string | null;
  sortOrder: number;
}

interface DashboardSummary {
  totalDevices: number;
  devicesOn: number;
  totalPowerW: number;
  roomsCount: number;
  automationsActiveCount: number;
  devicesPerRoom: { roomId: number; roomName: string; icon: string | null; deviceCount: number; devicesOn: number }[];
  activityByDay: { day: string; count: number }[];
}

const ICON_CHOICES = ["bulb", "home", "layers", "cpu", "star", "diamond", "sun", "moon", "wifi", "plug", "gauge", "briefcase", "camera", "mapPin", "grid", "bookmark"];

const UNGROUPED_DROP_ID = "ungrouped-drop";
type RoomSelection = number | "ungrouped";

export function DashboardTab() {
  const [view, setView] = useState<"overview" | "manage">("overview");
  const [selectedRoom, setSelectedRoom] = useState<RoomSelection | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState<LightingGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<LightingGroup | null>(null);
  const [pickingIconFor, setPickingIconFor] = useState<{ kind: "group" | "device"; id: number; current: string | null } | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<number | null>(null);
  const [editingDevice, setEditingDevice] = useState<LightingDevice | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<LightingDevice | null>(null);
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["lighting-groups"],
    queryFn: async () => (await axiosClient.get("/lighting/groups")).data as LightingGroup[],
  });
  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[],
    refetchInterval: 30_000,
  });
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["lighting-dashboard-summary"],
    queryFn: async () => (await axiosClient.get("/lighting/dashboard-summary")).data as DashboardSummary,
    refetchInterval: 30_000,
  });
  const { data: scenes } = useQuery({
    queryKey: ["lighting-scenes"],
    queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as LightingScene[],
  });

  function invalidateGroups() {
    queryClient.invalidateQueries({ queryKey: ["lighting-groups"] });
  }
  function invalidateDevices() {
    queryClient.invalidateQueries({ queryKey: ["lighting-devices"] });
    queryClient.invalidateQueries({ queryKey: ["lighting-dashboard-summary"] });
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
  const brightnessMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number }) => axiosClient.post(`/lighting/devices/${id}/brightness`, { value }),
    onSuccess: invalidateDevices,
  });
  const updateDeviceMutation = useMutation({
    mutationFn: (values: any) => axiosClient.patch(`/lighting/devices/${editingDevice!.id}`, values),
    onSuccess: () => { invalidateDevices(); setEditingDevice(null); },
  });
  const duplicateDeviceMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/devices/${id}/duplicate`),
    onSuccess: invalidateDevices,
  });
  const deleteDeviceMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/devices/${id}`),
    onSuccess: () => { invalidateDevices(); setDeletingDevice(null); },
  });
  const activateSceneMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/activate`),
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

  // Default to the first real room, falling back to "Ungrouped" once data has loaded.
  useEffect(() => {
    if (selectedRoom !== null) return;
    if (sortedGroups.length > 0) setSelectedRoom(sortedGroups[0].id);
    else if (ungroupedDevices.length > 0) setSelectedRoom("ungrouped");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedGroups.length, ungroupedDevices.length]);

  const selectedRoomDevices = selectedRoom === "ungrouped" ? ungroupedDevices : devices?.filter((d) => d.groupId === selectedRoom) ?? [];
  const selectedRoomLabel = selectedRoom === "ungrouped" ? "Ungrouped" : sortedGroups.find((g) => g.id === selectedRoom)?.name ?? null;
  const dimmableLight = selectedRoomDevices.find((d) => d.kind === "LIGHT" && d.protocol !== "GENERIC_HTTP");

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
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <div className="row gap-2">
          <button className={`btn btn-sm ${view === "overview" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("overview")}>Overview</button>
          <button className={`btn btn-sm ${view === "manage" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("manage")}>Manage Locations</button>
        </div>
        <PermissionGate module="lighting" action="create">
          <button className="btn btn-primary" onClick={() => setAddingGroup(true)}><Icon name="plus" size={14} /> Add Location</button>
        </PermissionGate>
      </div>

      {view === "overview" ? (
        <div className="stack gap-3">
          <div className="grid grid-cols-5 gap-3">
            <KpiCard label="Total Devices" value={summary?.totalDevices ?? "—"} icon="plug" tone="primary" />
            <KpiCard label="Devices On" value={summary?.devicesOn ?? "—"} icon="power" tone="success" live={(summary?.devicesOn ?? 0) > 0} />
            <KpiCard label="Power Draw" value={summary ? `${summary.totalPowerW} W` : "—"} icon="gauge" tone="warning" />
            <KpiCard label="Locations" value={summary?.roomsCount ?? "—"} icon="layers" tone="primary" />
            <KpiCard label="Automations Active" value={summary?.automationsActiveCount ?? "—"} icon="clock" tone="primary" />
          </div>

          <div className="card">
            <div className="row gap-1 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 8, marginBottom: 16, alignItems: "center" }}>
              {sortedGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedRoom(g.id)}
                  style={{
                    background: "none", border: "none", padding: "6px 14px", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                    color: selectedRoom === g.id ? "var(--color-text)" : "var(--color-text-muted)",
                    borderBottom: selectedRoom === g.id ? "2px solid var(--color-primary)" : "2px solid transparent",
                  }}
                >
                  {g.name}
                </button>
              ))}
              {ungroupedDevices.length > 0 && (
                <button
                  onClick={() => setSelectedRoom("ungrouped")}
                  style={{
                    background: "none", border: "none", padding: "6px 14px", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                    color: selectedRoom === "ungrouped" ? "var(--color-text)" : "var(--color-text-muted)",
                    borderBottom: selectedRoom === "ungrouped" ? "2px solid var(--color-primary)" : "2px solid transparent",
                  }}
                >
                  Ungrouped
                </button>
              )}
              <PermissionGate module="lighting" action="create">
                <button className="btn-icon" style={{ marginLeft: "auto" }} onClick={() => setAddingGroup(true)} title="Add location">
                  <Icon name="plus" size={14} />
                </button>
              </PermissionGate>
            </div>

            {isLoading && (
              <div className="grid grid-cols-4 gap-3">
                <Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} />
              </div>
            )}

            {!isLoading && !selectedRoomLabel && (
              <p className="muted" style={{ fontSize: 12 }}>No locations yet — add one to get started.</p>
            )}

            {!isLoading && selectedRoomLabel && (
              <div className="stack gap-3">
                {dimmableLight && (
                  <div className="card" style={{ background: "var(--color-bg)", maxWidth: 260 }}>
                    <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                      <strong style={{ fontSize: 13 }}>{dimmableLight.name}</strong>
                      <label className="form-toggle-switch" style={{ cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={dimmableLight.isOn}
                          disabled={dimmableLight.status === "OFFLINE"}
                          onChange={(e) => powerMutation.mutate({ id: dimmableLight.id, on: e.target.checked })}
                        />
                        <span className="form-toggle-switch-track" />
                      </label>
                    </div>
                    <RadialGauge value={dimmableLight.brightness ?? 0} tone="warning" size={120} sublabel="Brightness" />
                    <div className="row gap-2" style={{ justifyContent: "center", marginTop: 8 }}>
                      <button
                        className="btn btn-secondary btn-sm btn-icon"
                        disabled={!dimmableLight.isOn || brightnessMutation.isPending}
                        onClick={() => brightnessMutation.mutate({ id: dimmableLight.id, value: Math.max(0, (dimmableLight.brightness ?? 0) - 10) })}
                      >
                        −
                      </button>
                      <button
                        className="btn btn-secondary btn-sm btn-icon"
                        disabled={!dimmableLight.isOn || brightnessMutation.isPending}
                        onClick={() => brightnessMutation.mutate({ id: dimmableLight.id, value: Math.min(100, (dimmableLight.brightness ?? 0) + 10) })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {selectedRoomDevices.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12 }}>No devices in this location yet.</p>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
                    {selectedRoomDevices.map((d) => (
                      <LightingDeviceTile
                        key={d.id}
                        device={d}
                        onToggle={(on) => powerMutation.mutate({ id: d.id, on })}
                        onEdit={() => setEditingDevice(d)}
                        onDuplicate={() => duplicateDeviceMutation.mutate(d.id)}
                        onDelete={() => setDeletingDevice(d)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {(scenes ?? []).length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--color-border)" }}>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Quick Scenes</div>
                <div className="row gap-3 flex-wrap">
                  {(scenes ?? []).map((s) => {
                    const active = s.actions.length > 0 && s.actions.every((a) => devices?.find((d) => d.id === a.deviceId)?.isOn === a.turnOn);
                    return (
                      <button
                        key={s.id}
                        onClick={() => activateSceneMutation.mutate(s.id)}
                        title={`Activate "${s.name}"`}
                        style={{ position: "relative", width: 64, background: "none", border: "none", cursor: "pointer", textAlign: "center" }}
                      >
                        <div
                          style={{
                            width: 48, height: 48, margin: "0 auto", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                            background: "var(--color-primary-soft)", color: "var(--color-primary)",
                          }}
                        >
                          <Icon name="bot" size={22} />
                        </div>
                        <span
                          style={{
                            position: "absolute", top: -2, right: 6, width: 16, height: 16, borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                            background: active ? "var(--color-success)" : "var(--color-border)", border: "2px solid var(--color-surface)",
                          }}
                        >
                          <Icon name={active ? "check" : "close"} size={9} />
                        </span>
                        <div className="muted" style={{ fontSize: 11, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-5 gap-3">
            <div className="card" style={{ gridColumn: "span 3" }}>
              <strong style={{ fontSize: 14 }}>Lighting Activity (Last 7 Days)</strong>
              <p className="muted" style={{ fontSize: 11, margin: "2px 0 8px" }}>Times a device was switched on, from the activity log.</p>
              {summaryLoading ? <Skeleton height={180} /> : <SimpleBarChart data={summary?.activityByDay ?? []} xKey="day" yKey="count" glow />}
            </div>

            <div className="card" style={{ gridColumn: "span 2" }}>
              <strong style={{ fontSize: 14 }}>Quick Toggle</strong>
              <div className="stack gap-1" style={{ marginTop: 8 }}>
                {(devices ?? []).length === 0 && <p className="muted" style={{ fontSize: 12 }}>No devices yet.</p>}
                {(devices ?? []).slice(0, 3).map((d) => (
                  <div key={d.id} className="row gap-2" style={{ alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--color-border)" }}>
                    <Icon name={d.icon ?? (d.kind === "LIGHT" ? "bulb" : "plug")} size={16} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{d.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {d.status === "OFFLINE" ? "Offline" : d.kind === "LIGHT" && d.brightness !== null && d.isOn ? `${d.brightness}%` : d.isOn ? "On" : "Off"}
                      </div>
                    </div>
                    <label className="form-toggle-switch" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={d.isOn} disabled={d.status === "OFFLINE"} onChange={(e) => powerMutation.mutate({ id: d.id, on: e.target.checked })} />
                      <span className="form-toggle-switch-track" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="stack gap-3">
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
        </div>
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
          title="Delete location"
          message={`Delete "${deletingGroup.name}"? Its devices are kept, just ungrouped. This cannot be undone.`}
          danger
          loading={deleteGroupMutation.isPending}
          onCancel={() => setDeletingGroup(null)}
          onConfirm={() => deleteGroupMutation.mutate(deletingGroup.id)}
        />
      )}

      {editingDevice && (
        <DeviceFormModal
          initial={{
            name: editingDevice.name,
            protocol: editingDevice.protocol,
            ipAddress: editingDevice.ipAddress ?? "",
            port: editingDevice.port,
            locationId: editingDevice.location?.id ?? null,
            onUrl: editingDevice.onUrl ?? "",
            offUrl: editingDevice.offUrl ?? "",
            statusUrl: editingDevice.statusUrl ?? "",
            statusOnPath: editingDevice.statusOnPath ?? "",
          }}
          onClose={() => setEditingDevice(null)}
          onSubmit={(v) => updateDeviceMutation.mutate(v)}
          submitting={updateDeviceMutation.isPending}
        />
      )}

      {deletingDevice && (
        <ConfirmDialog
          title="Remove device"
          message={`Remove "${deletingDevice.name}"? This cannot be undone.`}
          danger
          loading={deleteDeviceMutation.isPending}
          onCancel={() => setDeletingDevice(null)}
          onConfirm={() => deleteDeviceMutation.mutate(deletingDevice.id)}
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
    <FormModal title={group ? "Rename Location" : "Add Location"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()}>
      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen, Living Room" autoFocus /></div>
    </FormModal>
  );
}
