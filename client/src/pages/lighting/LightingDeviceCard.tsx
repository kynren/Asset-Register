import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { PermissionGate } from "../../auth/PermissionGate";

export interface LightingDevice {
  id: number;
  name: string;
  protocol: "SHELLY" | "TASMOTA" | "GENERIC_HTTP";
  ipAddress: string | null;
  port: number | null;
  gen: number | null;
  kind: "SWITCH" | "LIGHT" | null;
  onUrl: string | null;
  offUrl: string | null;
  statusUrl: string | null;
  statusOnPath: string | null;
  location: { id: number; name: string } | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  isOn: boolean;
  brightness: number | null;
  powerW: number | null;
  lastCheckedAt: string | null;
}

const PROTOCOL_LABELS: Record<LightingDevice["protocol"], string> = {
  SHELLY: "Shelly",
  TASMOTA: "Tasmota",
  GENERIC_HTTP: "Generic HTTP",
};

export function LightingDeviceCard({
  device,
  onToggle,
  onBrightnessCommit,
  onEdit,
  onDelete,
}: {
  device: LightingDevice;
  onToggle: (on: boolean) => void;
  onBrightnessCommit: (value: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isLight = device.kind === "LIGHT" && device.protocol !== "GENERIC_HTTP";
  const offline = device.status === "OFFLINE";

  // Local draft value while dragging the slider — only committed (network call) on
  // release, so sweeping across the full 0-100 range doesn't fire dozens of requests.
  // Re-synced from the real device reading whenever a poll brings a fresh value in.
  const [liveBrightness, setLiveBrightness] = useState(device.brightness ?? 0);
  useEffect(() => setLiveBrightness(device.brightness ?? 0), [device.brightness]);

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong>{device.name}</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {PROTOCOL_LABELS[device.protocol]}
            {device.ipAddress && ` · ${device.ipAddress}${device.port ? `:${device.port}` : ""}`}
            {device.protocol === "SHELLY" && ` · ${device.gen ? `Gen ${device.gen}` : "?"}`}
            {" · "}{device.kind === "LIGHT" ? "Light" : device.kind === "SWITCH" ? "Switch" : "detecting..."}
            {device.location && ` · ${device.location.name}`}
          </div>
        </div>
        <div className="row gap-1">
          <PermissionGate module="lighting" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={onEdit} title="Edit device">
              <Icon name="edit" size={12} />
            </button>
          </PermissionGate>
          <PermissionGate module="lighting" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={onDelete} title="Remove device">
              <Icon name="trash" size={12} />
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="row gap-2" style={{ margin: "10px 0" }}>
        <StatusBadge status={device.status} />
        {device.powerW !== null && <span className="muted" style={{ fontSize: 12 }}>{device.powerW.toFixed(1)} W</span>}
        {device.lastCheckedAt && (
          <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
            checked {dayjs(device.lastCheckedAt).format("HH:mm:ss")}
          </span>
        )}
      </div>

      <div className="row gap-2" style={{ alignItems: "center", opacity: offline ? 0.5 : 1 }}>
        <label className="form-toggle-switch" style={{ cursor: offline ? "not-allowed" : "pointer" }}>
          <input type="checkbox" checked={device.isOn} disabled={offline} onChange={(e) => onToggle(e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
        <span style={{ fontSize: 13 }}>Power</span>
      </div>

      {isLight && (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted" style={{ fontSize: 12 }}>Brightness</span>
            <span className="muted" style={{ fontSize: 12 }}>{liveBrightness}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={liveBrightness}
            disabled={offline}
            onChange={(e) => setLiveBrightness(Number(e.target.value))}
            onMouseUp={(e) => onBrightnessCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onBrightnessCommit(Number((e.target as HTMLInputElement).value))}
            style={{ width: "100%", accentColor: "var(--color-primary)", marginTop: 4 }}
          />
        </div>
      )}
    </div>
  );
}
