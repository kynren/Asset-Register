import { useState } from "react";
import { FormModal } from "../../components/FormModal";

export interface NodeFormValues {
  type: string;
  role: string | null;
  label: string;
  ipAddress: string;
}

const TYPES = ["ROUTER", "SWITCH", "NVR", "OTHER"];
const ROLES: { value: string; label: string }[] = [
  { value: "", label: "— No specific role —" },
  { value: "CORE_SWITCH", label: "Core Switch" },
  { value: "DISTRIBUTION_SWITCH", label: "Distribution Switch" },
  { value: "EDGE_SWITCH", label: "Edge Switch" },
  { value: "GATEWAY_ROUTER", label: "Gateway Router" },
  { value: "HARDWARE_HOST", label: "Hardware Host" },
];

export function AddNodeModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: NodeFormValues) => void; submitting?: boolean }) {
  const [values, setValues] = useState<NodeFormValues>({ type: "ROUTER", role: null, label: "", ipAddress: "" });

  return (
    <FormModal title="Add Infrastructure Node" onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting}>
      <div className="field">
        <label>Type</label>
        <select className="select" value={values.type} onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Role</label>
        <select className="select" value={values.role ?? ""} onChange={(e) => setValues((v) => ({ ...v, role: e.target.value || null }))}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Label *</label>
        <input className="input" value={values.label} onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))} required placeholder="e.g. Core Switch — Server Room" />
      </div>
      <div className="field">
        <label>IP Address</label>
        <input className="input" value={values.ipAddress} onChange={(e) => setValues((v) => ({ ...v, ipAddress: e.target.value }))} placeholder="192.168.1.1" />
      </div>
    </FormModal>
  );
}
