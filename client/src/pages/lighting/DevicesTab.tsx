import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { DeviceFormModal, DeviceFormValues } from "./DeviceFormModal";
import { DiscoverPanel } from "./DiscoverPanel";
import { LightingDevice, LightingDeviceCard } from "./LightingDeviceCard";

// How often the page pulls a genuinely fresh reading from every saved device — same
// pattern as the NVR live-latency sparkline: a real network round trip on a timer, not
// just a re-read of whatever's already in the database.
const REFRESH_INTERVAL_MS = 10_000;

export function DevicesTab() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState<LightingDevice | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<LightingDevice | null>(null);
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery({
    queryKey: ["lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["lighting-devices"] });
  }

  const refreshMutation = useMutation({
    mutationFn: () => axiosClient.post("/lighting/devices/refresh-all"),
    onSuccess: invalidate,
  });

  useEffect(() => {
    const id = setInterval(() => refreshMutation.mutate(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMutation = useMutation({
    mutationFn: (values: DeviceFormValues) => axiosClient.post("/lighting/devices", values),
    onSuccess: () => { invalidate(); setShowAddForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (values: DeviceFormValues) => axiosClient.patch(`/lighting/devices/${editingDevice!.id}`, values),
    onSuccess: () => { invalidate(); setEditingDevice(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/devices/${id}`),
    onSuccess: () => { invalidate(); setDeletingDevice(null); },
  });

  const powerMutation = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => axiosClient.post(`/lighting/devices/${id}/power`, { on }),
    onSuccess: invalidate,
    onError: invalidate, // even a failed command should refresh the card (it flips to Offline)
  });

  const brightnessMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number }) => axiosClient.post(`/lighting/devices/${id}/brightness`, { value }),
    onSuccess: invalidate,
    onError: invalidate,
  });

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}>
          <Icon name="refresh" size={14} /> Refresh Now
        </button>
        <PermissionGate module="lighting" action="create">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" size={14} /> Add Device
          </button>
        </PermissionGate>
      </div>

      <DiscoverPanel onAdded={invalidate} />

      {createMutation.isError && (
        <div className="alert alert-danger">{(createMutation.error as any)?.response?.data?.error ?? "Could not add this device."}</div>
      )}
      {(powerMutation.isError || brightnessMutation.isError) && (
        <div className="alert alert-danger">
          {((powerMutation.error ?? brightnessMutation.error) as any)?.response?.data?.error ?? "Could not control that device."}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <Skeleton height={190} />
          <Skeleton height={190} />
          <Skeleton height={190} />
        </div>
      )}
      {!isLoading && devices?.length === 0 && <div className="empty-state card">No lighting devices added yet.</div>}

      <div className="grid grid-cols-3 gap-3">
        {devices?.map((device) => (
          <LightingDeviceCard
            key={device.id}
            device={device}
            onToggle={(on) => powerMutation.mutate({ id: device.id, on })}
            onBrightnessCommit={(value) => brightnessMutation.mutate({ id: device.id, value })}
            onEdit={() => setEditingDevice(device)}
            onDelete={() => setDeletingDevice(device)}
          />
        ))}
      </div>

      {showAddForm && (
        <DeviceFormModal onClose={() => setShowAddForm(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}
      {editingDevice && (
        <DeviceFormModal
          editing
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
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      )}
      {deletingDevice && (
        <ConfirmDialog
          title="Remove device"
          message={`Remove "${deletingDevice.name}" from Lighting? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeletingDevice(null)}
          onConfirm={() => deleteMutation.mutate(deletingDevice.id)}
        />
      )}
    </div>
  );
}
