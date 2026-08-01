import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "./Icon";
import { PermissionGate } from "../auth/PermissionGate";
import { ModuleName } from "../lib/permissions";

interface Coordinator {
  id: number;
  serialPort: string | null;
  status: "DISCONNECTED" | "CONNECTED" | "ERROR";
  lastError: string | null;
  updatedAt: string;
}
interface ZigbeeDevice {
  id: number;
  ieeeAddress: string;
  friendlyName: string;
  deviceType: string;
  lastSeenAt: string | null;
}

const STATUS_TONE: Record<Coordinator["status"], string> = {
  DISCONNECTED: "badge-neutral",
  CONNECTED: "badge-success",
  ERROR: "badge-danger",
};

/** Shared by Lighting and Access Control — each passes its own API prefix and RBAC module name.
 * NOT hardware-verified: no ZigBee coordinator dongle is available in this environment, so
 * "Test Connection" always reports a clear failure rather than faking success. See
 * server/src/lib/zigbeeCoordinator.ts. */
export function ZigbeeScaffoldTab({ apiBase, module }: { apiBase: string; module: ModuleName }) {
  const [serialPort, setSerialPort] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: coordinator } = useQuery({
    queryKey: [`${apiBase}-zigbee-coordinator`],
    queryFn: async () => (await axiosClient.get(`${apiBase}/zigbee/coordinator`)).data as Coordinator,
  });
  const { data: devices } = useQuery({
    queryKey: [`${apiBase}-zigbee-devices`],
    queryFn: async () => (await axiosClient.get(`${apiBase}/zigbee/devices`)).data as ZigbeeDevice[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: [`${apiBase}-zigbee-coordinator`] });
  }

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.patch(`${apiBase}/zigbee/coordinator`, { serialPort }),
    onSuccess: invalidate,
  });
  const connectMutation = useMutation({
    mutationFn: () => axiosClient.post(`${apiBase}/zigbee/coordinator/connect`),
    onSuccess: invalidate,
  });

  const currentPort = serialPort ?? coordinator?.serialPort ?? "";

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Coordinator</strong>
          {coordinator && <span className={`badge ${STATUS_TONE[coordinator.status]}`}>{coordinator.status}</span>}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Bridges paired ZigBee devices to this app via a USB coordinator dongle. This is a scaffold — no coordinator hardware or radio
          stack (e.g. zigbee-herdsman) is wired up in this build yet, so "Test Connection" will not succeed until that's added.
        </p>
        <div className="row gap-2" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Serial Port</label>
            <input className="input" value={currentPort} onChange={(e) => setSerialPort(e.target.value)} placeholder="e.g. COM3 or /dev/ttyUSB0" style={{ width: 220 }} />
          </div>
          <PermissionGate module={module} action="edit">
            <button className="btn btn-secondary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-primary" disabled={connectMutation.isPending} onClick={() => connectMutation.mutate()}>
              <Icon name="wifi" size={13} /> {connectMutation.isPending ? "Testing..." : "Test Connection"}
            </button>
          </PermissionGate>
        </div>
        {coordinator?.lastError && (
          <div className="alert alert-danger" style={{ marginTop: 10 }}>{coordinator.lastError}</div>
        )}
      </div>

      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Paired Devices</strong>
          <span className="muted" style={{ fontSize: 12 }}>{coordinator ? `Last checked ${dayjs(coordinator.updatedAt).format("HH:mm:ss")}` : ""}</span>
        </div>
        {(!devices || devices.length === 0) ? (
          <p className="muted" style={{ fontSize: 13 }}>No devices paired yet — connect a coordinator to permit joining and discover devices.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>IEEE Address</th><th>Type</th><th>Last Seen</th></tr></thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>{d.friendlyName}</td>
                  <td style={{ fontFamily: "monospace" }}>{d.ieeeAddress}</td>
                  <td>{d.deviceType}</td>
                  <td className="muted">{d.lastSeenAt ? dayjs(d.lastSeenAt).format("DD MMM, HH:mm") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
