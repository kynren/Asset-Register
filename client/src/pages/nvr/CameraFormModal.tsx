import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";
import { Icon } from "../../components/Icon";
import { TestConnectionButton } from "./TestConnectionButton";
import { LiveFeedPreview } from "./LiveFeedPreview";
import { PasswordInput } from "../../components/PasswordInput";

// Cameras always connect over RTSP (test connection + live preview). Channel is optional
// metadata for cameras proxied through an NVR — when set, the auto-filled RTSP URL follows
// Hikvision's per-channel path convention; ISAPI (used only for NVR channel discovery) is
// never used for the camera's own connection.

export interface CameraFormValues {
  name: string;
  channel: number | null;
  locationId: number | null;
  ipAddress: string;
  port: number | null;
  username: string;
  password: string;
  streamUrl: string;
  ptzEnabled: boolean;
}

const emptyValues: CameraFormValues = {
  name: "",
  channel: null,
  locationId: null,
  ipAddress: "",
  port: 554,
  username: "",
  password: "",
  streamUrl: "",
  ptzEnabled: false,
};

// Derives the RTSP stream URL from the connection details already entered, so the field
// doesn't have to be hand-typed. ISAPI channels follow Hikvision's fixed convention
// (always port 554, regardless of the ISAPI HTTP port entered above); direct RTSP cameras
// use the entered port and a generic default path.
function buildAutoStreamUrl(ipAddress: string, port: number | null, username: string, password: string, channel: number | null): string {
  if (!ipAddress.trim()) return "";
  const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
  if (channel) return `rtsp://${auth}${ipAddress}:554/Streaming/Channels/${channel}01`;
  return `rtsp://${auth}${ipAddress}:${port ?? 554}/stream1`;
}

const CONNECTION_FIELDS = new Set<keyof CameraFormValues>(["ipAddress", "port", "username", "password", "channel"]);

export function CameraFormModal({
  editing,
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  editing?: boolean;
  initial?: Partial<CameraFormValues>;
  onClose: () => void;
  onSubmit: (v: CameraFormValues) => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<CameraFormValues>({ ...emptyValues, ...initial });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });
  // While true, the Stream URL field tracks the connection fields automatically; typing
  // directly into it (or loading an existing camera that already has one saved) turns
  // this off so we never clobber a hand-entered or previously-saved URL.
  const [streamUrlAuto, setStreamUrlAuto] = useState(!initial?.streamUrl);

  useEffect(() => {
    setValues({ ...emptyValues, ...initial });
    setStreamUrlAuto(!initial?.streamUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function update<K extends keyof CameraFormValues>(key: K, value: CameraFormValues[K]) {
    if (key === "streamUrl") setStreamUrlAuto(value === "");
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (CONNECTION_FIELDS.has(key) && streamUrlAuto) {
        next.streamUrl = buildAutoStreamUrl(next.ipAddress, next.port, next.username, next.password, next.channel);
      }
      return next;
    });
  }

  return (
    <FormModal title={editing ? "Edit Camera" : "Add Camera"} onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} maxWidth={700}>
      <div className="grid grid-cols-3">
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. Gate Sentry Dome" /></div>
        <div className="field"><label>Channel</label><input className="input" type="number" value={values.channel ?? ""} onChange={(e) => update("channel", e.target.value ? Number(e.target.value) : null)} placeholder="Channel # on the NVR (optional)" /></div>
        <QuickAddSelect label="Location" value={values.locationId} onChange={(id) => update("locationId", id)} options={locations} createUrl="/locations" queryKey="locations" />
        <div className="field"><label>IP Address</label><input className="input" value={values.ipAddress} onChange={(e) => update("ipAddress", e.target.value)} /></div>
        <div className="field"><label>Port</label><input className="input" type="number" value={values.port ?? ""} onChange={(e) => update("port", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="field"><label>Username</label><input className="input" value={values.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" /></div>
        <div className="field"><label>Password</label><PasswordInput value={values.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" placeholder={editing ? "Leave blank to keep current password" : ""} /></div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>RTSP Stream URL</label>
          <input className="input" value={values.streamUrl} onChange={(e) => update("streamUrl", e.target.value)} placeholder="rtsp://192.168.1.20:554/stream1" />
          <span className="muted" style={{ fontSize: 11 }}>Auto-filled from the IP, port, channel, and credentials above — edit directly to override.</span>
        </div>
      </div>

      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="route" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">PTZ Enabled</div>
          <div className="toggle-card-desc">Allow pan/tilt/zoom control for this camera from the Live View panel.</div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={values.ptzEnabled} onChange={(e) => update("ptzEnabled", e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>

      <TestConnectionButton
        ipAddress={values.ipAddress}
        port={values.port}
        protocol="RTSP"
        username={values.username}
        password={values.password}
      />
      <LiveFeedPreview streamUrl={values.streamUrl} />
    </FormModal>
  );
}
