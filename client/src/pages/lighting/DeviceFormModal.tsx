import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";

export type LightingProtocol = "SHELLY" | "TASMOTA" | "GENERIC_HTTP";

export interface DeviceFormValues {
  name: string;
  protocol: LightingProtocol;
  ipAddress: string;
  port: number | null;
  locationId: number | null;
  onUrl: string;
  offUrl: string;
  statusUrl: string;
  statusOnPath: string;
}

const emptyValues: DeviceFormValues = {
  name: "",
  protocol: "SHELLY",
  ipAddress: "",
  port: 80,
  locationId: null,
  onUrl: "",
  offUrl: "",
  statusUrl: "",
  statusOnPath: "",
};

const PROTOCOL_LABELS: Record<LightingProtocol, string> = {
  SHELLY: "Shelly",
  TASMOTA: "Tasmota",
  GENERIC_HTTP: "Generic HTTP (any web-controllable device)",
};

const PROTOCOL_HELP: Record<LightingProtocol, string> = {
  SHELLY: "Connects directly to the device's local Shelly API over Wi-Fi — no cloud account needed. Generation (Gen1/Gen2/3) and whether it's a switch or a dimmable light are detected automatically once saved. If this device has more than one output (e.g. a Shelly 2PM or Pro 4PM), one entry is created per output automatically.",
  TASMOTA: "Connects directly to the device's local Tasmota HTTP API over Wi-Fi — no cloud account needed. Whether it's a plain switch or a dimmable light is detected automatically once saved. Devices with a Tasmota web admin password set are not supported.",
  GENERIC_HTTP: "For any other web-controllable light or IoT device — Home Assistant automations, ESPHome, IFTTT/webhook proxies, or a self-built relay. Supply the exact URLs the app should call to turn it on/off, and optionally a URL to read its current state.",
};

export function DeviceFormModal({
  editing,
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  editing?: boolean;
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

  const isGeneric = values.protocol === "GENERIC_HTTP";
  const canSubmit = values.name && (isGeneric ? values.onUrl && values.offUrl : values.ipAddress);

  return (
    <FormModal title={editing ? "Edit Lighting Device" : "Add Lighting Device"} onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} submitDisabled={!canSubmit}>
      <div className="grid grid-cols-2">
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. Kitchen Downlights" /></div>
        <div className="field">
          <label>Device Type *</label>
          <select className="input" value={values.protocol} onChange={(e) => update("protocol", e.target.value as LightingProtocol)} disabled={editing}>
            {(Object.keys(PROTOCOL_LABELS) as LightingProtocol[]).map((p) => (
              <option key={p} value={p}>{PROTOCOL_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <QuickAddSelect label="Location" value={values.locationId} onChange={(id) => update("locationId", id)} options={locations} createUrl="/locations" queryKey="locations" />

        {isGeneric ? (
          <>
            <div className="field"><label>On URL *</label><input className="input" value={values.onUrl} onChange={(e) => update("onUrl", e.target.value)} placeholder="http://10.0.0.5/relay/on" /></div>
            <div className="field"><label>Off URL *</label><input className="input" value={values.offUrl} onChange={(e) => update("offUrl", e.target.value)} placeholder="http://10.0.0.5/relay/off" /></div>
            <div className="field"><label>Status URL</label><input className="input" value={values.statusUrl} onChange={(e) => update("statusUrl", e.target.value)} placeholder="http://10.0.0.5/status (optional)" /></div>
            <div className="field"><label>Status JSON Path</label><input className="input" value={values.statusOnPath} onChange={(e) => update("statusOnPath", e.target.value)} placeholder="e.g. state.on (optional)" /></div>
          </>
        ) : (
          <>
            <div className="field"><label>IP Address *</label><input className="input" value={values.ipAddress} onChange={(e) => update("ipAddress", e.target.value)} required placeholder="192.168.1.42" /></div>
            <div className="field"><label>Port</label><input className="input" type="number" value={values.port ?? ""} onChange={(e) => update("port", e.target.value ? Number(e.target.value) : null)} placeholder="80" /></div>
          </>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>{PROTOCOL_HELP[values.protocol]}</p>
    </FormModal>
  );
}
