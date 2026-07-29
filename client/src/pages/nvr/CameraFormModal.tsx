import { useEffect, useState } from "react";
import { FormModal } from "../../components/FormModal";
import { TestConnectionButton } from "./TestConnectionButton";
import { LiveFeedPreview } from "./LiveFeedPreview";

export interface CameraFormValues {
  name: string;
  channel: number | null;
  location: string;
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
  location: "",
  ipAddress: "",
  port: 554,
  username: "",
  password: "",
  streamUrl: "",
  ptzEnabled: false,
};

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

  useEffect(() => {
    setValues({ ...emptyValues, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function update<K extends keyof CameraFormValues>(key: K, value: CameraFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <FormModal title={editing ? "Edit Camera" : "Add Camera"} onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} maxWidth={620}>
      <div className="grid grid-cols-2">
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required /></div>
        <div className="field"><label>Channel</label><input className="input" type="number" value={values.channel ?? ""} onChange={(e) => update("channel", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="field"><label>Location</label><input className="input" value={values.location} onChange={(e) => update("location", e.target.value)} /></div>
        <div className="field"><label>IP Address</label><input className="input" value={values.ipAddress} onChange={(e) => update("ipAddress", e.target.value)} /></div>
        <div className="field"><label>Port</label><input className="input" type="number" value={values.port ?? ""} onChange={(e) => update("port", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="field"><label>Username</label><input className="input" value={values.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" /></div>
        <div className="field"><label>Password</label><input className="input" type="password" value={values.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" placeholder={editing ? "Leave blank to keep current password" : ""} /></div>
        <div className="field">
          <label>PTZ Enabled</label>
          <select className="select" value={values.ptzEnabled ? "yes" : "no"} onChange={(e) => update("ptzEnabled", e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>RTSP Stream URL</label>
        <input className="input" value={values.streamUrl} onChange={(e) => update("streamUrl", e.target.value)} placeholder="rtsp://192.168.1.20:554/stream1" />
      </div>

      <TestConnectionButton ipAddress={values.ipAddress} port={values.port} protocol="RTSP" />
      <LiveFeedPreview streamUrl={values.streamUrl} />
    </FormModal>
  );
}
