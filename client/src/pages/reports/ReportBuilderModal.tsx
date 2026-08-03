import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { QueryFilterBuilder, FilterCondition } from "../../components/QueryFilterBuilder";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";
import { DATA_EXPLORER_SOURCES, getSource } from "../dashboard/dataExplorerConfig";

type Visualization = "kpi" | "table" | "bar" | "pie" | "line";

interface ReportDetail {
  id: number;
  name: string;
  description: string | null;
  source: string;
  filters: { combinator: "AND" | "OR"; conditions: FilterCondition[] } | null;
  columns: string[] | null;
  groupBy: string | null;
  visualization: Visualization;
  canEdit: boolean;
}

type PreviewResult =
  | { kind: "kpi"; value: number }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "chart"; data: { label: string; count: number }[] };

export function ReportBuilderModal({ reportId, onClose }: { reportId?: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const availableSources = DATA_EXPLORER_SOURCES.filter((s) => hasPermission(s.module as ModuleName, "view"));

  const { data: existing } = useQuery<ReportDetail>({
    queryKey: ["report-detail", reportId],
    queryFn: async () => (await axiosClient.get(`/reports/${reportId}`)).data,
    enabled: reportId != null,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState(availableSources[0]?.id ?? "");
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [visualization, setVisualization] = useState<Visualization>("table");
  const [initialized, setInitialized] = useState(reportId == null);

  const source = getSource(sourceId) ?? availableSources[0];

  useEffect(() => {
    if (existing && !initialized) {
      setName(existing.name);
      setDescription(existing.description ?? "");
      setSourceId(existing.source);
      setCombinator(existing.filters?.combinator ?? "AND");
      setConditions(existing.filters?.conditions ?? []);
      setColumns(existing.columns ?? getSource(existing.source)?.defaultColumns ?? []);
      setGroupBy(existing.groupBy ?? "");
      setVisualization(existing.visualization);
      setInitialized(true);
    }
  }, [existing, initialized]);

  useEffect(() => {
    if (!initialized) return;
    if (columns.length === 0 && source) setColumns(source.defaultColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, initialized]);

  function changeSource(id: string) {
    setSourceId(id);
    setConditions([]);
    setGroupBy("");
    setColumns(getSource(id)?.defaultColumns ?? []);
  }

  function toggleColumn(key: string) {
    setColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));
  }

  const spec = source
    ? {
        source: source.id,
        filters: { combinator, conditions },
        columns: visualization === "table" ? columns : undefined,
        groupBy: groupBy || undefined,
        visualization,
      }
    : null;

  const { data: preview, isFetching: previewLoading } = useQuery<PreviewResult>({
    queryKey: ["report-preview", spec],
    queryFn: async () => (await axiosClient.post("/reports/preview", spec)).data,
    enabled: !!spec && initialized,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        source: source!.id,
        filters: { combinator, conditions },
        columns: visualization === "table" ? columns : null,
        groupBy: groupBy || null,
        visualization,
      };
      return reportId ? axiosClient.patch(`/reports/${reportId}`, body) : axiosClient.post("/reports", body);
    },
    meta: { successMessage: reportId ? "Report updated" : "Report created" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      if (reportId) queryClient.invalidateQueries({ queryKey: ["report-detail", reportId] });
      onClose();
    },
  });

  const canSave = name.trim().length > 0 && !!source;

  return (
    <FormModal
      title={reportId ? "Edit Report" : "New Report"}
      onClose={onClose}
      onSubmit={() => saveMutation.mutate()}
      submitLabel={reportId ? "Save Changes" : "Create Report"}
      submitDisabled={!canSave || saveMutation.isPending}
      submitting={saveMutation.isPending}
      maxWidth={760}
    >
      <div className="field">
        <label>Report Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Assets Due for Maintenance" />
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this report for?" />
      </div>

      <div className="field">
        <label>Data Source</label>
        <ChipSelect value={sourceId} onChange={changeSource} options={availableSources.map((s) => ({ value: s.id, label: s.label }))} />
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
              onChange={(v) => setVisualization(v as Visualization)}
              options={[
                { value: "table", label: "Table" },
                { value: "kpi", label: "KPI Count" },
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

          {visualization === "table" && (
            <div className="field">
              <label>Columns</label>
              <div className="row gap-2 flex-wrap">
                {source.availableColumns.map((c) => (
                  <label key={c.value} className="row gap-1" style={{ fontSize: 13, alignItems: "center" }}>
                    <input type="checkbox" checked={columns.includes(c.value)} onChange={() => toggleColumn(c.value)} /> {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label>Live Preview</label>
            <div className="card" style={{ padding: 12, maxHeight: 220, overflow: "auto" }}>
              {previewLoading ? (
                <p className="muted" style={{ margin: 0 }}>Loading preview...</p>
              ) : !preview ? (
                <p className="muted" style={{ margin: 0 }}>—</p>
              ) : preview.kind === "kpi" ? (
                <div style={{ fontSize: 28, fontWeight: 700 }}>{preview.value}</div>
              ) : preview.kind === "chart" ? (
                preview.data.length ? (
                  <table className="data-table">
                    <thead><tr><th>Label</th><th>Count</th></tr></thead>
                    <tbody>
                      {preview.data.map((d, i) => (
                        <tr key={i}><td>{d.label}</td><td>{d.count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>No matching data.</p>
                )
              ) : preview.rows.length ? (
                <table className="data-table">
                  <thead>
                    <tr>{preview.columns.map((c) => <th key={c}>{source.availableColumns.find((ac) => ac.value === c)?.label ?? c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{preview.columns.map((c) => <td key={c}>{String(row[c] ?? "—")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No matching data.</p>
              )}
            </div>
          </div>
        </>
      )}
    </FormModal>
  );
}
