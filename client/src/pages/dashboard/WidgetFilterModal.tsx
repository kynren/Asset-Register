import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { FieldDef, FieldOption } from "./dataExplorerConfig";

function useFieldOptions(field: FieldDef) {
  const { data } = useQuery({
    queryKey: ["data-explorer-options", field.dynamicOptions],
    queryFn: async () => {
      switch (field.dynamicOptions) {
        case "assetCategories":
          return (await axiosClient.get("/asset-categories")).data.map((c: any) => ({ value: String(c.id), label: c.name }));
        case "locations":
          return (await axiosClient.get("/locations")).data.map((l: any) => ({ value: String(l.id), label: l.name }));
        case "ticketCategories":
          return (await axiosClient.get("/ticket-categories")).data.map((c: any) => ({ value: String(c.id), label: c.name }));
        case "users":
          return (await axiosClient.get("/users/directory")).data.map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }));
        case "roles":
          return (await axiosClient.get("/roles")).data.map((r: any) => ({ value: String(r.id), label: r.name }));
        default:
          return [];
      }
    },
    enabled: !!field.dynamicOptions,
  });
  return field.options ?? data ?? [];
}

function FilterField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const options: FieldOption[] = useFieldOptions(field);

  let input: JSX.Element;
  if (field.type === "boolean") {
    input = (
      <ChipSelect
        value={value}
        onChange={onChange}
        placeholder="Any"
        options={[
          { value: "", label: "Any" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
      />
    );
  } else if (field.type === "enum") {
    input = (
      <ChipSelect
        value={value}
        onChange={onChange}
        placeholder="Any"
        options={[{ value: "", label: "Any" }, ...options.map((o) => ({ value: o.value, label: o.label }))]}
      />
    );
  } else if (field.type === "date") {
    input = <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === "number") {
    input = <input className="input" type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
  } else {
    input = <input className="input" type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Any" />;
  }

  return (
    <div className="field">
      <label>{field.label}</label>
      {input}
    </div>
  );
}

// The simple, per-module counterpart to CustomQueryConfigModal's full query builder — one direct
// field:value filter per row (no operators/combinators), scoped to whatever module the widget
// already belongs to. Filters persist on the widget's own layout item and narrow that widget's
// existing dataset rather than letting it reach into a different data source.
export function WidgetFilterModal({
  fields,
  initial,
  onClose,
  onSave,
}: {
  fields: FieldDef[];
  initial: Record<string, string>;
  onClose: () => void;
  onSave: (filters: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial);

  return (
    <FormModal
      title="Configure Widget Filters"
      onClose={onClose}
      onSubmit={() => {
        const cleaned = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
        onSave(cleaned);
      }}
      submitLabel="Apply Filters"
    >
      {fields.map((f) => (
        <FilterField key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues({ ...values, [f.key]: v })} />
      ))}
      {Object.values(values).some((v) => v !== "") && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setValues({})}>
          Clear all filters
        </button>
      )}
    </FormModal>
  );
}
