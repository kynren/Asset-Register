import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";

export interface StockItemFormValues {
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
  unitCost: number | null;
  locationId: number | null;
}

export function StockItemFormModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: StockItemFormValues) => void; submitting?: boolean }) {
  const [values, setValues] = useState<StockItemFormValues>({ sku: "", name: "", category: "", unit: "pcs", reorderLevel: 0, unitCost: null, locationId: null });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });

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
        <QuickAddSelect label="Location" value={values.locationId} onChange={(id) => update("locationId", id)} options={locations} createUrl="/locations" queryKey="locations" />
      </div>
    </FormModal>
  );
}
