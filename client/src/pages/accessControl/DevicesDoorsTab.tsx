import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { FormModal } from "../../components/FormModal";
import { DeviceFormModal, DeviceFormValues } from "./DeviceFormModal";
import { DoorFormModal, DoorFormValues } from "./DoorFormModal";

interface Door {
  id: number;
  deviceId: number;
  doorNumber: number;
  name: string;
  lockState: "LOCKED" | "UNLOCKED" | "UNKNOWN";
  doorState: "OPEN" | "CLOSED" | "UNKNOWN";
  lastCheckedAt: string | null;
}
interface Device {
  id: number;
  name: string;
  ipAddress: string | null;
  port: number | null;
  username: string | null;
  location: { id: number; name: string } | null;
  model: string | null;
  notes: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastEventSyncAt: string | null;
  doors: Door[];
}

const LOCK_TONE: Record<Door["lockState"], string> = { LOCKED: "badge-neutral", UNLOCKED: "badge-warning", UNKNOWN: "badge-neutral" };

type DoorAction = "open" | "close" | "alwaysOpen" | "alwaysClose" | "resume";

const MORE_DOOR_ACTIONS: { value: DoorAction; label: string }[] = [
  { value: "alwaysOpen", label: "Always Unlock" },
  { value: "alwaysClose", label: "Always Lock" },
  { value: "resume", label: "Resume Schedule" },
];

export function DevicesDoorsTab() {
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
  const [doorDeviceId, setDoorDeviceId] = useState<number | null>(null);
  const [deletingDoor, setDeletingDoor] = useState<Door | null>(null);
  const [renamingDoor, setRenamingDoor] = useState<Door | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Keyed by door id — same pattern as discoveryResults below, but for a single door's forced
  // status re-read instead of a whole device's rediscovery.
  const [doorStatusResults, setDoorStatusResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  // Keyed by device id — lets "Refresh Doors" (and door discovery right after adding a device)
  // explain *why* no doors showed up (auth failure, unreachable, unsupported firmware) instead
  // of silently leaving the door list empty with no explanation.
  const [discoveryResults, setDiscoveryResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["access-control-devices"] });
  }

  function stripBlankPassword<T extends { password: string }>(values: T) {
    const { password, ...rest } = values;
    return password ? values : rest;
  }

  const createDeviceMutation = useMutation({
    mutationFn: (values: DeviceFormValues) => axiosClient.post("/access-control/devices", values),
    onSuccess: (res) => {
      const { id, doorDiscovery } = res.data as { id: number; doorDiscovery: { ok: boolean; message: string } | null };
      if (doorDiscovery) setDiscoveryResults((r) => ({ ...r, [id]: doorDiscovery }));
      invalidate();
      setShowDeviceForm(false);
    },
  });

  const updateDeviceMutation = useMutation({
    mutationFn: (values: DeviceFormValues) => axiosClient.patch(`/access-control/devices/${editingDevice!.id}`, stripBlankPassword(values)),
    onSuccess: (res) => {
      const { id, doorDiscovery } = res.data as { id: number; doorDiscovery: { ok: boolean; message: string } | null };
      if (doorDiscovery) setDiscoveryResults((r) => ({ ...r, [id]: doorDiscovery }));
      invalidate();
      setEditingDevice(null);
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/devices/${id}`),
    onSuccess: () => { invalidate(); setDeletingDevice(null); },
  });

  const duplicateDeviceMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/duplicate`),
    onSuccess: invalidate,
  });

  const checkStatusMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/check-status`),
    onSuccess: invalidate,
  });

  const refreshDoorsMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/refresh-doors`),
    onSuccess: (res, id) => {
      setDiscoveryResults((r) => ({ ...r, [id]: res.data as { ok: boolean; message: string } }));
      invalidate();
    },
  });

  const createDoorMutation = useMutation({
    mutationFn: (values: DoorFormValues) => axiosClient.post(`/access-control/devices/${doorDeviceId}/doors`, values),
    onSuccess: () => { invalidate(); setDoorDeviceId(null); },
  });

  const deleteDoorMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/doors/${id}`),
    onSuccess: () => { invalidate(); setDeletingDoor(null); },
  });

  const renameDoorMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => axiosClient.patch(`/access-control/doors/${id}`, { name }),
    onSuccess: () => { invalidate(); setRenamingDoor(null); },
  });

  const refreshDoorStatusMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/doors/${id}/refresh-status`),
    onSuccess: (res, id) => {
      const { ok, message } = res.data as { ok: boolean; message: string };
      setDoorStatusResults((r) => ({ ...r, [id]: { ok, message } }));
      invalidate();
    },
  });

  const controlDoorMutation = useMutation({
    mutationFn: ({ doorId, action }: { doorId: number; action: DoorAction }) => axiosClient.post(`/access-control/doors/${doorId}/control`, { action }),
    onSuccess: invalidate,
  });

  return (
    <div className="stack gap-3">
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <PermissionGate module="access-control" action="create">
          <button className="btn btn-primary" onClick={() => setShowDeviceForm(true)}><Icon name="plus" size={14} /> Add Device</button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="stack gap-3">
          <Skeleton height={110} />
          <Skeleton height={110} />
        </div>
      )}
      {!isLoading && devices?.length === 0 && <div className="empty-state card">No access control devices registered yet.</div>}

      {devices?.map((device) => (
        <div key={device.id} className="card">
          <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="row gap-2">
              <Icon name="key" size={20} />
              <div>
                <div className="row gap-2">
                  <strong>{device.name}</strong>
                  <StatusBadge status={device.status} />
                </div>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                  {device.ipAddress ?? "No IP set"}{device.port ? `:${device.port}` : ""} · {device.location?.name ?? "No location"}
                  {device.lastCheckedAt && ` · checked ${dayjs(device.lastCheckedAt).format("HH:mm:ss")}`}
                  {device.lastEventSyncAt && ` · events synced ${dayjs(device.lastEventSyncAt).format("DD MMM, HH:mm")}`}
                </p>
              </div>
            </div>
            <div className="row gap-2">
              <PermissionGate module="access-control" action="edit">
                <button className="btn btn-secondary btn-sm" disabled={checkStatusMutation.isPending} onClick={() => checkStatusMutation.mutate(device.id)}>
                  <Icon name="wifi" size={13} /> Check Status
                </button>
                <button className="btn btn-secondary btn-sm" disabled={refreshDoorsMutation.isPending} onClick={() => refreshDoorsMutation.mutate(device.id)}>
                  <Icon name="refresh" size={13} /> Refresh Doors
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingDevice(device)}><Icon name="edit" size={12} /> Edit</button>
              </PermissionGate>
              <PermissionGate module="access-control" action="create">
                <button className="btn btn-secondary btn-sm" onClick={() => setDoorDeviceId(device.id)}><Icon name="plus" size={12} /> Add Door</button>
                <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateDeviceMutation.mutate(device.id)}><Icon name="paperclip" size={12} /></button>
              </PermissionGate>
              <PermissionGate module="access-control" action="delete">
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletingDevice(device)}><Icon name="trash" size={13} /></button>
              </PermissionGate>
            </div>
          </div>

          {discoveryResults[device.id] && (
            <div className={`alert ${discoveryResults[device.id].ok ? "alert-success" : "alert-danger"}`} style={{ marginBottom: 12, fontSize: 12 }}>
              {discoveryResults[device.id].message}
            </div>
          )}

          {device.doors.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No doors added yet.
              {!discoveryResults[device.id] && ' Click "Refresh Doors" to auto-detect, or "Add Door" to add one manually.'}
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Door #</th><th>Name</th><th>Door State</th><th>Lock State</th><th>Last Checked</th><th></th></tr></thead>
              <tbody>
                {device.doors.map((door) => (
                  <Fragment key={door.id}>
                    <tr>
                      <td>{door.doorNumber}</td>
                      <td>{door.name}</td>
                      <td><span className={`badge ${door.doorState === "OPEN" ? "badge-warning" : "badge-neutral"}`}>{door.doorState}</span></td>
                      <td><span className={`badge ${LOCK_TONE[door.lockState]}`}>{door.lockState}</span></td>
                      <td className="muted">{door.lastCheckedAt ? dayjs(door.lastCheckedAt).format("DD MMM, HH:mm:ss") : "—"}</td>
                      <td>
                        <div className="row gap-1">
                          <PermissionGate module="access-control" action="edit">
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={controlDoorMutation.isPending}
                              onClick={() => controlDoorMutation.mutate({ doorId: door.id, action: "open" })}
                              title="Remotely open this door"
                            >
                              <Icon name="key" size={12} /> Open
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={controlDoorMutation.isPending}
                              onClick={() => controlDoorMutation.mutate({ doorId: door.id, action: "close" })}
                              title="Remotely close this door"
                            >
                              Close
                            </button>
                            <select
                              className="select"
                              style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
                              value=""
                              disabled={controlDoorMutation.isPending}
                              title="Always-unlock / always-lock override, or resume the door's own schedule"
                              onChange={(e) => {
                                if (!e.target.value) return;
                                controlDoorMutation.mutate({ doorId: door.id, action: e.target.value as DoorAction });
                                e.target.value = "";
                              }}
                            >
                              <option value="">More...</option>
                              {MORE_DOOR_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                            <button
                              className="btn btn-secondary btn-sm btn-icon"
                              disabled={refreshDoorStatusMutation.isPending}
                              onClick={() => refreshDoorStatusMutation.mutate(door.id)}
                              title="Force a live status read for this door"
                            >
                              <Icon name="refresh" size={12} />
                            </button>
                            <button
                              className="btn btn-secondary btn-sm btn-icon"
                              onClick={() => { setRenamingDoor(door); setRenameValue(door.name); }}
                              title="Rename door"
                            >
                              <Icon name="edit" size={12} />
                            </button>
                          </PermissionGate>
                          <PermissionGate module="access-control" action="delete">
                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletingDoor(door)} title="Delete door">
                              <Icon name="trash" size={12} />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                    {doorStatusResults[door.id] && (
                      <tr>
                        <td colSpan={6} style={{ paddingTop: 0 }}>
                          <div className={`alert ${doorStatusResults[door.id].ok ? "alert-success" : "alert-danger"}`} style={{ fontSize: 12, margin: 0 }}>
                            {doorStatusResults[door.id].message}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {showDeviceForm && (
        <DeviceFormModal onClose={() => setShowDeviceForm(false)} onSubmit={(v) => createDeviceMutation.mutate(v)} submitting={createDeviceMutation.isPending} />
      )}
      {editingDevice && (
        <DeviceFormModal
          deviceId={editingDevice.id}
          initial={{
            name: editingDevice.name,
            ipAddress: editingDevice.ipAddress ?? "",
            port: editingDevice.port,
            username: editingDevice.username ?? "",
            password: "",
            locationId: editingDevice.location?.id ?? null,
            model: editingDevice.model ?? "",
            notes: editingDevice.notes ?? "",
          }}
          onClose={() => setEditingDevice(null)}
          onSubmit={(v) => updateDeviceMutation.mutate(v)}
          submitting={updateDeviceMutation.isPending}
        />
      )}
      {doorDeviceId !== null && (
        <DoorFormModal onClose={() => setDoorDeviceId(null)} onSubmit={(v) => createDoorMutation.mutate(v)} submitting={createDoorMutation.isPending} />
      )}
      {renamingDoor && (
        <FormModal
          title="Rename Door"
          onClose={() => setRenamingDoor(null)}
          onSubmit={() => renameDoorMutation.mutate({ id: renamingDoor.id, name: renameValue })}
          submitting={renameDoorMutation.isPending}
          submitDisabled={!renameValue.trim()}
        >
          <div className="field">
            <label>Name *</label>
            <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </div>
        </FormModal>
      )}

      {deletingDevice && (
        <ConfirmDialog
          title="Delete device"
          message={`Are you sure you want to delete "${deletingDevice.name}" and all its doors/credentials? This cannot be undone.`}
          danger
          loading={deleteDeviceMutation.isPending}
          onCancel={() => setDeletingDevice(null)}
          onConfirm={() => deleteDeviceMutation.mutate(deletingDevice.id)}
        />
      )}
      {deletingDoor && (
        <ConfirmDialog
          title="Delete door"
          message={`Are you sure you want to delete "${deletingDoor.name}"? This cannot be undone.`}
          danger
          loading={deleteDoorMutation.isPending}
          onCancel={() => setDeletingDoor(null)}
          onConfirm={() => deleteDoorMutation.mutate(deletingDoor.id)}
        />
      )}
    </div>
  );
}
