import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";

interface AccessEvent {
  id: number;
  employeeNo: string | null;
  cardNumber: string | null;
  eventType: string;
  message: string | null;
  occurredAt: string;
  device: { id: number; name: string };
  door: { id: number; name: string } | null;
}
interface Device {
  id: number;
  name: string;
}

const TYPE_TONE: Record<string, string> = {
  REMOTE_OPEN: "badge-primary",
  REMOTE_CLOSE: "badge-neutral",
  REMOTE_CONTROL_ERROR: "badge-danger",
};

export function AccessEventLogTab() {
  const [deviceId, setDeviceId] = useState<number | "">("");
  const queryClient = useQueryClient();

  const { data: devices } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[],
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["access-events", deviceId],
    queryFn: async () => (await axiosClient.get("/access-control/events", { params: deviceId ? { deviceId } : {} })).data as AccessEvent[],
    refetchInterval: 15_000,
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/sync-events`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access-events"] }),
  });

  const columns: ColumnDef<AccessEvent, any>[] = [
    { header: "Time", accessorFn: (e) => dayjs(e.occurredAt).format("DD MMM YYYY, HH:mm:ss") },
    { header: "Device", accessorFn: (e) => e.device.name },
    { header: "Door", accessorFn: (e) => e.door?.name ?? "—" },
    { header: "Type", cell: ({ row }) => <span className={`badge ${TYPE_TONE[row.original.eventType] ?? "badge-neutral"}`}>{row.original.eventType.replace(/_/g, " ")}</span> },
    { header: "Card / Employee", accessorFn: (e) => e.cardNumber ?? e.employeeNo ?? "—" },
    { header: "Message", accessorFn: (e) => e.message ?? "—" },
  ];

  return (
    <div className="stack gap-3">
      <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between" }}>
        <select className="select" style={{ width: "auto" }} value={deviceId} onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All devices</option>
          {devices?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <PermissionGate module="access-control" action="edit">
          <button
            className="btn btn-secondary btn-sm"
            disabled={!deviceId || syncMutation.isPending}
            title={!deviceId ? "Select a device to sync its events" : undefined}
            onClick={() => deviceId && syncMutation.mutate(deviceId)}
          >
            <Icon name="refresh" size={13} /> {syncMutation.isPending ? "Syncing..." : "Sync Now"}
          </button>
        </PermissionGate>
      </div>
      {syncMutation.data && (
        <div className={`alert ${syncMutation.data.data.ok ? "alert-success" : "alert-danger"}`}>{syncMutation.data.data.message}</div>
      )}

      <div className="card">
        <DataTable tableId="accessControl.eventLog" defaultViewMode="list" columns={columns} data={events ?? []} isLoading={isLoading} clientPageSize={15} emptyMessage="No access events recorded yet — select a device and Sync Now to pull its history." />
      </div>
    </div>
  );
}
