import { useState } from "react";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";
import { DATA_EXPLORER_SOURCES } from "./dataExplorerConfig";

export interface ComparisonSourceConfig {
  source: string;
  label: string;
}

export interface ComparisonQueryConfig {
  title: string;
  sources: ComparisonSourceConfig[];
}

const MIN_SOURCES = 2;
const MAX_SOURCES = 4;

// Counterpart to CustomQueryConfigModal, but instead of one deep ad-hoc query against a single
// source, this picks 2-4 whole sources and shows a record-count side by side in one chart — the
// "combine Assets + Helpdesk stats in one widget" cross-module comparison from the design plan.
export function ComparisonConfigModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: ComparisonQueryConfig;
  onClose: () => void;
  onSave: (config: ComparisonQueryConfig) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const { hasPermission } = useAuth();
  const availableSources = DATA_EXPLORER_SOURCES.filter((s) => hasPermission(s.module as ModuleName, "view"));
  const [rows, setRows] = useState<ComparisonSourceConfig[]>(
    initial?.sources ?? [
      { source: availableSources[0]?.id ?? "", label: "" },
      { source: availableSources[1]?.id ?? availableSources[0]?.id ?? "", label: "" },
    ]
  );

  function updateRow(index: number, patch: Partial<ComparisonSourceConfig>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (rows.length >= MAX_SOURCES) return;
    setRows([...rows, { source: availableSources[0]?.id ?? "", label: "" }]);
  }

  function removeRow(index: number) {
    if (rows.length <= MIN_SOURCES) return;
    setRows(rows.filter((_, i) => i !== index));
  }

  const canSave = title.trim().length > 0 && rows.length >= MIN_SOURCES && rows.every((r) => r.source);

  return (
    <FormModal
      title={initial ? "Edit Comparison Widget" : "Add Comparison Widget"}
      onClose={onClose}
      onSubmit={() => canSave && onSave({ title: title.trim(), sources: rows.map((r) => ({ source: r.source, label: r.label.trim() })) })}
      submitLabel={initial ? "Save Changes" : "Add Widget"}
      submitDisabled={!canSave}
      maxWidth={560}
    >
      <div className="field">
        <label>Widget Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Open Items Across Modules" />
      </div>

      <div className="field">
        <label>Data Sources (record count per source)</label>
        <div className="stack gap-2">
          {rows.map((row, i) => (
            <div key={i} className="row gap-2" style={{ alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <ChipSelect
                  value={row.source}
                  onChange={(v) => updateRow(i, { source: v })}
                  options={availableSources.map((s) => ({ value: s.id, label: s.label }))}
                />
              </div>
              <input
                className="input"
                style={{ flex: 1 }}
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder={availableSources.find((s) => s.id === row.source)?.label ?? "Custom label..."}
              />
              {rows.length > MIN_SOURCES && (
                <button type="button" className="btn btn-secondary btn-sm btn-icon" title="Remove source" onClick={() => removeRow(i)}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        {rows.length < MAX_SOURCES && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addRow}>
            <Icon name="plus" size={12} /> Add Source
          </button>
        )}
      </div>
    </FormModal>
  );
}
