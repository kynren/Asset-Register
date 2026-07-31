import { useState } from "react";
import { FormModal } from "../../components/FormModal";

export interface DoorFormValues {
  doorNumber: number;
  name: string;
}

export function DoorFormModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: DoorFormValues) => void; submitting?: boolean }) {
  const [values, setValues] = useState<DoorFormValues>({ doorNumber: 1, name: "" });

  return (
    <FormModal title="Add Door" onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting}>
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Door Number *</label>
          <input className="input" type="number" min={1} value={values.doorNumber} onChange={(e) => setValues((v) => ({ ...v, doorNumber: Number(e.target.value) }))} required />
          <span className="muted" style={{ fontSize: 11 }}>The controller's own door index (usually 1-4).</span>
        </div>
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required placeholder="e.g. Front Door" /></div>
      </div>
    </FormModal>
  );
}
