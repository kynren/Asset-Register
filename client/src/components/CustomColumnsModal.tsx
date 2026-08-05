import { useState } from "react";
import { FormModal } from "./FormModal";
import { Icon } from "./Icon";
import { CustomColumn, useCustomColumns } from "../hooks/useCustomColumns";

const FIELD_TYPE_OPTIONS: { value: CustomColumn["fieldType"]; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes / No" },
];

export function CustomColumnsModal({ entityType, title, onClose }: { entityType: string; title: string; onClose: () => void }) {
  const { columns, createMutation, deleteMutation } = useCustomColumns(entityType);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<CustomColumn["fieldType"]>("TEXT");

  function handleAdd() {
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), fieldType }, { onSuccess: () => setName("") });
  }

  return (
    <FormModal title={title} onClose={onClose} hideFooter>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 14 }}>
        Add your own extra columns to this table — editable inline per row, visible to everyone with access to this list.
      </p>

      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {columns.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No custom columns yet.</div>}
        {columns.map((c) => (
          <div key={c.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{FIELD_TYPE_OPTIONS.find((f) => f.value === c.fieldType)?.label}</span>
            </div>
            <button className="btn btn-danger btn-sm btn-icon" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(c.id)}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="row gap-2" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Column name</label>
          <input className="input" placeholder="e.g. PO Number" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Type</label>
          <select className="input" value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomColumn["fieldType"])}>
            {FIELD_TYPE_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" disabled={!name.trim() || createMutation.isPending} onClick={handleAdd}>
          <Icon name="plus" size={12} /> Add
        </button>
      </div>
    </FormModal>
  );
}
