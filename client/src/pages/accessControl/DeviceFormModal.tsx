import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";
import { PasswordInput } from "../../components/PasswordInput";
import { IsapiTestConnectionButton } from "./IsapiTestConnectionButton";

export interface DeviceFormValues {
  name: string;
  ipAddress: string;
  port: number | null;
  username: string;
  password: string;
  locationId: number | null;
  model: string;
  notes: string;
}

const emptyValues: DeviceFormValues = {
  name: "",
  ipAddress: "",
  port: 80,
  username: "",
  password: "",
  locationId: null,
  model: "",
  notes: "",
};

export function DeviceFormModal({
  deviceId,
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  deviceId?: number;
  initial?: Partial<DeviceFormValues>;
  onClose: () => void;
  onSubmit: (v: DeviceFormValues) => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<DeviceFormValues>({ ...emptyValues, ...initial });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });

  useEffect(() => {
    setValues({ ...emptyValues, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function update<K extends keyof DeviceFormValues>(key: K, value: DeviceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <FormModal title={deviceId ? "Edit Access Control Device" : "Add Access Control Device"} onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} maxWidth={700}>
      <div className="grid grid-cols-3">
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. Main Entrance Controller" /></div>
        <div className="field"><label>Model</label><input className="input" value={values.model} onChange={(e) => update("model", e.target.value)} /></div>
        <QuickAddSelect label="Location" value={values.locationId} onChange={(id) => update("locationId", id)} options={locations} createUrl="/locations" queryKey="locations" />
        <div className="field"><label>IP Address</label><input className="input" value={values.ipAddress} onChange={(e) => update("ipAddress", e.target.value)} placeholder="192.168.1.50" /></div>
        <div className="field"><label>Port</label><input className="input" type="number" value={values.port ?? ""} onChange={(e) => update("port", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="field"><label>Username</label><input className="input" value={values.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" /></div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>Password</label>
          <PasswordInput value={values.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" placeholder={deviceId ? "Leave blank to keep current password" : ""} />
        </div>
        <div className="field" style={{ gridColumn: "span 3" }}><label>Notes</label><input className="input" value={values.notes} onChange={(e) => update("notes", e.target.value)} /></div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Credentials are encrypted at rest and never shown again after saving.</p>

      <IsapiTestConnectionButton ipAddress={values.ipAddress} port={values.port} username={values.username} password={values.password} />
    </FormModal>
  );
}
