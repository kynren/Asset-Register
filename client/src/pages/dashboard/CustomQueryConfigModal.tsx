import { useState } from "react";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { QueryFilterBuilder, FilterCondition } from "../../components/QueryFilterBuilder";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";
import { DATA_EXPLORER_SOURCES, getSource } from "./dataExplorerConfig";

export type CustomQueryCondition = FilterCondition;

export interface CustomQueryConfig {
  title: string;
  source: string;
  combinator: "AND" | "OR";
  conditions: CustomQueryCondition[];
  groupBy?: string;
  visualization: "kpi" | "table" | "bar" | "pie" | "line";
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
            <QueryFilterBuilder source={source} combinator={combinator} conditions={conditions} onCombinatorChange={setCombinator} onConditionsChange={setConditions} />
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
