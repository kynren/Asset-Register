import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "./Icon";
import { ChipSelect } from "./ChipSelect";
import { FieldDef, FieldOption, OPERATOR_LABELS, SourceDef } from "../pages/dashboard/dataExplorerConfig";

export interface FilterCondition {
  field: string;
  operator: string;
  value: string | string[];
}

function useFieldOptions(field: FieldDef | undefined) {
  const { data } = useQuery({
    queryKey: ["data-explorer-options", field?.dynamicOptions],
    queryFn: async () => {
      switch (field!.dynamicOptions) {
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
    enabled: !!field?.dynamicOptions,
  });
  return field?.options ?? data ?? [];
}

function ValueInput({ field, operator, value, onChange }: { field: FieldDef; operator: string; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const options: FieldOption[] = useFieldOptions(field);

  if (operator === "in") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <select
        className="select"
        multiple
        value={selected}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
        style={{ minHeight: 60 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  const strValue = typeof value === "string" ? value : "";
  if (field.type === "boolean") {
    return (
      <ChipSelect
        value={strValue || "true"}
        onChange={onChange}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
      />
    );
  }
  if (field.type === "enum" && options.length) {
    return (
      <ChipSelect
        value={strValue}
        onChange={onChange}
        placeholder="Select..."
        options={[{ value: "", label: "Select..." }, ...options.map((o) => ({ value: o.value, label: o.label }))]}
      />
    );
  }
  if (field.type === "date") {
    return <input className="input" type="date" value={strValue} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === "number") {
    return <input className="input" type="number" value={strValue} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input className="input" type="text" value={strValue} onChange={(e) => onChange(e.target.value)} placeholder="Value" />;
}

function ConditionRow({
  source,
  condition,
  onChange,
  onRemove,
}: {
  source: SourceDef;
  condition: FilterCondition;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
}) {
  const field = source.fields.find((f) => f.key === condition.field) ?? source.fields[0];

  return (
    <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
      <ChipSelect
        style={{ width: "auto" }}
        value={field.key}
        onChange={(v) => {
          const nextField = source.fields.find((f) => f.key === v)!;
          onChange({ field: nextField.key, operator: nextField.operators[0], value: "" });
        }}
        options={source.fields.map((f) => ({ value: f.key, label: f.label }))}
      />
      <ChipSelect
        style={{ width: "auto" }}
        value={condition.operator}
        onChange={(v) => onChange({ ...condition, operator: v, value: v === "in" ? [] : "" })}
        options={field.operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] ?? op }))}
      />
      <ValueInput field={field} operator={condition.operator} value={condition.value} onChange={(v) => onChange({ ...condition, value: v })} />
      <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={onRemove} title="Remove condition">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

// Renders the whole AND/OR + condition-row editing surface for a data-explorer filter, driven by
// a SourceDef (see dataExplorerConfig.ts). Shared by the dashboard Custom Query widget builder and
// the Report Builder so both use one implementation of field/operator/value editing.
export function QueryFilterBuilder({
  source,
  combinator,
  conditions,
  onCombinatorChange,
  onConditionsChange,
}: {
  source: SourceDef;
  combinator: "AND" | "OR";
  conditions: FilterCondition[];
  onCombinatorChange: (combinator: "AND" | "OR") => void;
  onConditionsChange: (conditions: FilterCondition[]) => void;
}) {
  function addCondition() {
    const field = source.fields[0];
    onConditionsChange([...conditions, { field: field.key, operator: field.operators[0], value: "" }]);
  }

  return (
    <div>
      {conditions.length > 1 && (
        <div className="row gap-2" style={{ marginBottom: 8 }}>
          <label className="row gap-1" style={{ fontSize: 13 }}>
            <input type="radio" checked={combinator === "AND"} onChange={() => onCombinatorChange("AND")} /> Match ALL conditions
          </label>
          <label className="row gap-1" style={{ fontSize: 13 }}>
            <input type="radio" checked={combinator === "OR"} onChange={() => onCombinatorChange("OR")} /> Match ANY condition
          </label>
        </div>
      )}
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          source={source}
          condition={c}
          onChange={(next) => onConditionsChange(conditions.map((cc, ii) => (ii === i ? next : cc)))}
          onRemove={() => onConditionsChange(conditions.filter((_, ii) => ii !== i))}
        />
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={addCondition}>
        <Icon name="plus" size={12} /> Add Condition
      </button>
    </div>
  );
}
