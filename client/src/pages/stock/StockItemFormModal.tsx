import { useState } from "react";
import { FormModal } from "../../components/FormModal";

export interface StockItemFormValues {
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
  unitCost: number | null;
}

export function StockItemFormModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: StockItemFormValues) => void; submitting?: boolean }) {
  const [values, setValues] = useState<StockItemFormValues>({ sku: "", name: "", category: "", unit: "pcs", reorderLevel: 0, unitCost: null });

  function update<K extends keyof StockItemFormValues>(key: K, value: StockItemFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <FormModal title="Add Stock Item" onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting}>
      <div className="grid grid-cols-2">
        <div className="field"><label>SKU *</label><input className="input" value={values.sku} onChange={(e) => update("sku", e.target.value)} required /></div>
        <div className="field"><label>Name *</label><input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required /></div>
        <div className="field"><label>Category</label><input className="input" value={values.category} onChange={(e) => update("category", e.target.value)} /></div>
        <div className="field"><label>Unit</label><input className="input" value={values.unit} onChange={(e) => update("unit", e.target.value)} /></div>
        <div className="field"><label>Reorder Level</label><input className="input" type="number" min={0} value={values.reorderLevel} onChange={(e) => update("reorderLevel", Number(e.target.value))} /></div>
        <div className="field"><label>Unit Cost</label><input className="input" type="number" min={0} step="0.01" value={values.unitCost ?? ""} onChange={(e) => update("unitCost", e.target.value ? Number(e.target.value) : null)} /></div>
      </div>
    </FormModal>
  );
}
