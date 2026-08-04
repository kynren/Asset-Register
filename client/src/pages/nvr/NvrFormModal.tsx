import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";
import { TestConnectionButton } from "./TestConnectionButton";
import { DiscoverCamerasPanel } from "./DiscoverCamerasPanel";
import { PasswordInput } from "../../components/PasswordInput";
import { ChipSelect } from "../../components/ChipSelect";

export interface NvrFormValues {
  name: string;
  ipAddress: string;
  port: number | null;
  httpPort: number | null;
  protocol: string;
  username: string;
  password: string;
  locationId: number | null;
  model: string;
}

const PROTOCOLS = ["RTSP", "HTTP", "ONVIF", "ISAPI"];

const emptyValues: NvrFormValues = {
  name: "",
  ipAddress: "",
  port: 554,
  httpPort: 80,
  protocol: "RTSP",
  username: "",
  password: "",
  locationId: null,
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
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });

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
        <QuickAddSelect label="Location" value={values.locationId} onChange={(id) => update("locationId", id)} options={locations} createUrl="/locations" queryKey="locations" />
        <div className="field"><label>IP Address</label><input className="input" value={values.ipAddress} onChange={(e) => update("ipAddress", e.target.value)} placeholder="192.168.1.10" /></div>
        <div className="field"><label>Port{values.protocol === "ISAPI" || values.protocol === "ONVIF" ? " (RTSP)" : ""}</label><input className="input" type="number" value={values.port ?? ""} onChange={(e) => update("port", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="field">
          <label>Protocol</label>
          <ChipSelect value={values.protocol} onChange={(v) => update("protocol", v)} options={PROTOCOLS.map((p) => ({ value: p, label: p }))} />
        </div>
        {(values.protocol === "ISAPI" || values.protocol === "ONVIF") && (
          <div className="field">
            <label>HTTP Port ({values.protocol})</label>
            <input className="input" type="number" value={values.httpPort ?? ""} onChange={(e) => update("httpPort", e.target.value ? Number(e.target.value) : null)} placeholder="80" />
            <span className="muted" style={{ fontSize: 11 }}>{values.protocol} speaks HTTP/SOAP on its own port — usually different from the RTSP port above (often 554).</span>
          </div>
        )}
        <div className="field"><label>Username</label><input className="input" value={values.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" /></div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>Password</label>
          <PasswordInput value={values.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" placeholder={nvrId ? "Leave blank to keep current password" : ""} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Credentials are encrypted at rest and never shown again after saving.</p>

      <TestConnectionButton ipAddress={values.ipAddress} port={values.port} httpPort={values.httpPort} protocol={values.protocol} username={values.username} password={values.password} />

      {nvrId ? (
        <DiscoverCamerasPanel
          nvrId={nvrId}
          ipAddress={values.ipAddress}
          port={values.httpPort}
          username={values.username}
          password={values.password}
          protocol={values.protocol}
          onImported={() => onCamerasImported?.()}
        />
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>Save this NVR first to discover and import its connected cameras.</p>
      )}
    </FormModal>
  );
}
