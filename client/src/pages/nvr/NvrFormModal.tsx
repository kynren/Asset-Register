import { useEffect, useState } from "react";
import { FormModal } from "../../components/FormModal";
import { TestConnectionButton } from "./TestConnectionButton";
import { DiscoverCamerasPanel } from "./DiscoverCamerasPanel";

export interface NvrFormValues {
  name: string;
  ipAddress: string;
  port: number | null;
  protocol: string;
  username: string;
  password: string;
  location: string;
  model: string;
}

const PROTOCOLS = ["RTSP", "HTTP", "ONVIF"];

const emptyValues: NvrFormValues = {
  name: "",
  ipAddress: "",
  port: 554,
  protocol: "RTSP",
  username: "",
  password: "",
  location: "",
  model: "",
};

export function NvrFormModal({
  nvrId,
  initial,
  onClose,
  onSubmit,
  submitting,
  onCamerasImported,
}: {
  nvrId?: number;
  initial?: Partial<NvrFormValues>;
  onClose: () => void;
  onSubmit: (v: NvrFormValues) => void;
  submitting?: boolean;
  onCamerasImported?: () => void;
}) {
  const [values, setValues] = useState<NvrFormValues>({ ...emptyValues, ...initial });

  useEffect(() => {
    setValues({ ...emptyValues, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function update<K extends keyof NvrFormValues>(key: K, value: NvrFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <FormModal title={nvrId ? "Edit NVR" : "Add NVR"} onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} maxWidth={700}>
      <div className="grid grid-cols-3">
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. Main Perimeter NVR" /></div>
        <div className="field"><label>Model</label><input className="input" value={values.model} onChange={(e) => update("model", e.target.value)} /></div>
        <div className="field"><label>Location</label><input className="input" value={values.location} onChange={(e) => update("location", e.target.value)} /></div>
        <div className="field"><label>IP Address</label><input className="input" value={values.ipAddress} onChange={(e) => update("ipAddress", e.target.value)} placeholder="192.168.1.10" /></div>
        <div className="field"><label>Port</label><input className="input" type="number" value={values.port ?? ""} onChange={(e) => update("port", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="field">
          <label>Protocol</label>
          <select className="select" value={values.protocol} onChange={(e) => update("protocol", e.target.value)}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>Username</label><input className="input" value={values.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" /></div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>Password</label>
          <input className="input" type="password" value={values.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" placeholder={nvrId ? "Leave blank to keep current password" : ""} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Credentials are encrypted at rest and never shown again after saving.</p>

      <TestConnectionButton ipAddress={values.ipAddress} port={values.port} protocol={values.protocol} />

      {nvrId ? (
        <DiscoverCamerasPanel
          nvrId={nvrId}
          ipAddress={values.ipAddress}
          port={values.port}
          username={values.username}
          password={values.password}
          onImported={() => onCamerasImported?.()}
        />
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>Save this NVR first to discover and import its connected cameras.</p>
      )}
    </FormModal>
  );
}
