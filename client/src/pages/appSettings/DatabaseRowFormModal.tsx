import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { PasswordInput } from "../../components/PasswordInput";
import { DbFieldInfo, DbModelInfo, SENSITIVE_FIELD_PATTERN } from "./databaseTypes";

function toDatetimeLocalValue(iso: unknown): string {
  if (typeof iso !== "string" && !(iso instanceof Date)) return "";
  const d = new Date(iso as string);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FkPicker({ field, value, onChange }: { field: DbFieldInfo; value: unknown; onChange: (v: string) => void }) {
  const { data } = useQuery({
    queryKey: ["db-options", field.relationModel],
    queryFn: async () => (await axiosClient.get(`/database/tables/${field.relationModel}/options`)).data as { id: number; label: string }[],
  });
  return (
    <ChipSelect
      value={value === null || value === undefined ? "" : String(value)}
      onChange={onChange}
      placeholder={`Select ${field.relationModel}...`}
      options={[
        ...(field.isRequired ? [] : [{ value: "", label: "— None —" }]),
        ...(data ?? []).map((o) => ({ value: String(o.id), label: `${o.label} (#${o.id})` })),
      ]}
    />
  );
}

export function DatabaseRowFormModal({
  model,
  enums,
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  model: DbModelInfo;
  enums: Record<string, string[]>;
  initial: Record<string, unknown> | null;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {};
    for (const f of model.fields) {
      if (!f.editable) continue;
      base[f.name] = initial ? initial[f.name] : f.type === "Boolean" ? false : "";
    }
    return base;
  });

  function update(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  const editableFields = model.fields.filter((f) => f.editable);

  return (
    <FormModal
      title={initial ? `Edit ${model.name} #${String(initial[model.idField])}` : `New ${model.name}`}
      onClose={onClose}
      onSubmit={() => onSubmit(values)}
      submitting={submitting}
      maxWidth={640}
    >
      <div className="grid grid-cols-2">
        {editableFields.map((f) => {
          const raw = values[f.name];
          const label = `${f.name}${f.isRequired ? " *" : ""}`;

          if (f.isForeignKey) {
            return (
              <div className="field" key={f.name}>
                <label>{label}</label>
                <FkPicker field={f} value={raw} onChange={(v) => update(f.name, v === "" ? null : Number(v))} />
              </div>
            );
          }
          if (f.kind === "enum") {
            const options = enums[f.type] ?? [];
            return (
              <div className="field" key={f.name}>
                <label>{label}</label>
                <ChipSelect
                  value={raw === null || raw === undefined ? "" : String(raw)}
                  onChange={(v) => update(f.name, v)}
                  options={[
                    ...(f.isRequired ? [] : [{ value: "", label: "— None —" }]),
                    ...options.map((o) => ({ value: o, label: o })),
                  ]}
                />
              </div>
            );
          }
          if (f.type === "Boolean") {
            return (
              <div className="field" key={f.name}>
                <label>{label}</label>
                <label className="form-toggle-switch">
                  <input type="checkbox" checked={Boolean(raw)} onChange={(e) => update(f.name, e.target.checked)} />
                  <span className="form-toggle-switch-track" />
                </label>
              </div>
            );
          }
          if (f.type === "Int" || f.type === "Float" || f.type === "Decimal") {
            return (
              <div className="field" key={f.name}>
                <label>{label}</label>
                <input className="input" type="number" value={raw === null || raw === undefined ? "" : String(raw)} onChange={(e) => update(f.name, e.target.value)} />
              </div>
            );
          }
          if (f.type === "DateTime") {
            return (
              <div className="field" key={f.name}>
                <label>{label}</label>
                <input className="input" type="datetime-local" value={toDatetimeLocalValue(raw)} onChange={(e) => update(f.name, e.target.value ? new Date(e.target.value).toISOString() : "")} />
              </div>
            );
          }
          if (f.type === "Json") {
            return (
              <div className="field" style={{ gridColumn: "span 2" }} key={f.name}>
                <label>{label}</label>
                <textarea
                  className="input"
                  style={{ fontFamily: "monospace", fontSize: 12, minHeight: 100 }}
                  value={typeof raw === "string" ? raw : raw ? JSON.stringify(raw, null, 2) : ""}
                  onChange={(e) => update(f.name, e.target.value)}
                />
              </div>
            );
          }
          const isSensitive = SENSITIVE_FIELD_PATTERN.test(f.name);
          return (
            <div className="field" key={f.name}>
              <label>{label}</label>
              {isSensitive ? (
                <PasswordInput value={raw === null || raw === undefined ? "" : String(raw)} onChange={(e) => update(f.name, e.target.value)} />
              ) : (
                <input className="input" value={raw === null || raw === undefined ? "" : String(raw)} onChange={(e) => update(f.name, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
    </FormModal>
  );
}
