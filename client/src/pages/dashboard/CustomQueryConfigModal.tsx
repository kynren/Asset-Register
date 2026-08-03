import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { ChipSelect } from "../../components/ChipSelect";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";
import { DATA_EXPLORER_SOURCES, FieldDef, FieldOption, OPERATOR_LABELS, SourceDef, getSource } from "./dataExplorerConfig";

export interface CustomQueryCondition {
  field: string;
  operator: string;
  value: string | string[];
}

export interface CustomQueryConfig {
  title: string;
  source: string;
  combinator: "AND" | "OR";
  conditions: CustomQueryCondition[];
  groupBy?: string;
  visualization: "kpi" | "table" | "bar" | "pie" | "line";
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
  condition: CustomQueryCondition;
  onChange: (next: CustomQueryCondition) => void;
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

export function CustomQueryConfigModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: CustomQueryConfig;
  onClose: () => void;
  onSave: (config: CustomQueryConfig) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [sourceId, setSourceId] = useState(initial?.source ?? DATA_EXPLORER_SOURCES[0].id);
  const [combinator, setCombinator] = useState<"AND" | "OR">(initial?.combinator ?? "AND");
  const [conditions, setConditions] = useState<CustomQueryCondition[]>(initial?.conditions ?? []);
  const [groupBy, setGroupBy] = useState(initial?.groupBy ?? "");
  const [visualization, setVisualization] = useState<CustomQueryConfig["visualization"]>(initial?.visualization ?? "kpi");

  const { hasPermission } = useAuth();
  const availableSources = DATA_EXPLORER_SOURCES.filter((s) => hasPermission(s.module as ModuleName, "view"));
  const source = getSource(sourceId) ?? availableSources[0];

  function changeSource(id: string) {
    setSourceId(id);
    setConditions([]);
    setGroupBy("");
  }

  function addCondition() {
    if (!source) return;
    const field = source.fields[0];
    setConditions([...conditions, { field: field.key, operator: field.operators[0], value: "" }]);
  }

  const canSave = title.trim().length > 0 && !!source;

  return (
    <FormModal
      title={initial ? "Edit Custom Widget" : "Add Custom Query Widget"}
      onClose={onClose}
      onSubmit={() =>
        source &&
        onSave({
          title: title.trim(),
          source: source.id,
          combinator,
          conditions,
          groupBy: groupBy || undefined,
          visualization,
        })
      }
      submitLabel={initial ? "Save Changes" : "Add Widget"}
      submitDisabled={!canSave}
      maxWidth={620}
    >
      <div className="field">
        <label>Widget Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Overdue High-Priority Tickets" />
      </div>

      <div className="field">
        <label>Data Source</label>
        <ChipSelect
          value={sourceId}
          onChange={changeSource}
          options={availableSources.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>

      {source && (
        <>
          <div className="field">
            <label>Filters</label>
            {conditions.length > 1 && (
              <div className="row gap-2" style={{ marginBottom: 8 }}>
                <label className="row gap-1" style={{ fontSize: 13 }}>
                  <input type="radio" checked={combinator === "AND"} onChange={() => setCombinator("AND")} /> Match ALL conditions
                </label>
                <label className="row gap-1" style={{ fontSize: 13 }}>
                  <input type="radio" checked={combinator === "OR"} onChange={() => setCombinator("OR")} /> Match ANY condition
                </label>
              </div>
            )}
            {conditions.map((c, i) => (
              <ConditionRow
                key={i}
                source={source}
                condition={c}
                onChange={(next) => setConditions(conditions.map((cc, ii) => (ii === i ? next : cc)))}
                onRemove={() => setConditions(conditions.filter((_, ii) => ii !== i))}
              />
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addCondition}>
              <Icon name="plus" size={12} /> Add Condition
            </button>
          </div>

          <div className="field">
            <label>Visualization</label>
            <ChipSelect
              value={visualization}
              onChange={(v) => setVisualization(v as CustomQueryConfig["visualization"])}
              options={[
                { value: "kpi", label: "KPI Count" },
                { value: "table", label: "Table" },
                { value: "bar", label: "Bar Chart" },
                { value: "pie", label: "Pie Chart" },
                { value: "line", label: "Line Chart" },
              ]}
            />
          </div>

          {["bar", "pie", "line"].includes(visualization) && (
            <div className="field">
              <label>Group By</label>
              <ChipSelect
                value={groupBy}
                onChange={setGroupBy}
                options={source.groupableFields.map((key) => ({ value: key, label: source.fields.find((f) => f.key === key)?.label ?? key }))}
              />
            </div>
          )}
        </>
      )}
    </FormModal>
  );
}
