import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { KpiCard } from "../../components/KpiCard";
import { DataTable } from "../../components/DataTable";
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from "../../components/ChartWrapper";
import { PermissionGate } from "../../auth/PermissionGate";
import { getSource } from "../dashboard/dataExplorerConfig";
import { ReportBuilderModal } from "./ReportBuilderModal";
import { ShareReportModal } from "./ShareReportModal";
import { EmailReportModal } from "./EmailReportModal";
import { ReportPdfPreviewModal } from "./ReportPdfPreviewModal";

interface ReportDetail {
  id: number;
  name: string;
  description: string | null;
  source: string;
  visualization: "kpi" | "table" | "bar" | "pie" | "line";
  isOwner: boolean;
  canEdit: boolean;
}

type RunResult =
  | { kind: "kpi"; value: number }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "chart"; data: { label: string; count: number }[] };

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
  return String(value);
}

export function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const { data: report } = useQuery<ReportDetail>({
    queryKey: ["report-detail", reportId],
    queryFn: async () => (await axiosClient.get(`/reports/${reportId}`)).data,
  });

  const { data: result, isLoading } = useQuery<RunResult>({
    queryKey: ["report-run", reportId],
    queryFn: async () => (await axiosClient.get(`/reports/${reportId}/run`)).data,
    enabled: !!report,
  });

  const source = report ? getSource(report.source) : undefined;

  const tableColumns: ColumnDef<Record<string, unknown>, any>[] = useMemo(() => {
    if (!result || result.kind !== "table") return [];
    return result.columns.map((c, i) => ({
      header: source?.availableColumns.find((ac) => ac.value === c)?.label ?? c,
      accessorKey: c,
      cell: ({ getValue }) => formatCell(getValue()),
      meta: i === 0 ? { cardTitle: true } : undefined,
    }));
  }, [result, source]);

  async function downloadFile(kind: "csv" | "pdf") {
    const res = await axiosClient.get(`/reports/${reportId}/export.${kind}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(report?.name ?? "report").replace(/[^a-z0-9-_]+/gi, "_")}.${kind}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  if (!report) {
    return <div className="empty-state">Loading report...</div>;
  }

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/reports")} style={{ marginBottom: 8 }}>
            <Icon name="chevronLeft" size={12} /> Back to Reports
          </button>
          <h1 className="page-title">{report.name}</h1>
          {report.description && <p className="page-subtitle">{report.description}</p>}
        </div>
        <div className="row gap-2 flex-wrap report-toolbar">
          {report.canEdit && (
            <PermissionGate module="reports" action="edit">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(true)}><Icon name="edit" size={12} /> Edit</button>
            </PermissionGate>
          )}
          <PermissionGate module="reports" action="export">
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile("csv")}><Icon name="download" size={12} /> Export CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile("pdf")}><Icon name="download" size={12} /> Export PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPdfPreview(true)}><Icon name="eye" size={12} /> Preview PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={() => window.print()}><Icon name="file" size={12} /> Print</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEmail(true)}><Icon name="mail" size={12} /> Email</button>
          </PermissionGate>
          {report.isOwner && (
            <PermissionGate module="reports" action="edit">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowShare(true)}><Icon name="link" size={12} /> Share</button>
            </PermissionGate>
          )}
        </div>
      </div>

      <div className="card" id="report-print-area">
        <h2 style={{ marginTop: 0 }}>{report.name}</h2>
        {report.description && <p className="muted">{report.description}</p>}

        {isLoading || !result ? (
          <div className="empty-state">Running report...</div>
        ) : result.kind === "kpi" ? (
          <KpiCard label={report.name} value={result.value} icon="file" tone="primary" />
        ) : result.kind === "chart" ? (
          result.data.length === 0 ? (
            <div className="empty-state">No matching records.</div>
          ) : report.visualization === "pie" ? (
            <SimplePieChart data={result.data} dataKey="count" nameKey="label" glow />
          ) : report.visualization === "line" ? (
            <SimpleLineChart data={result.data} xKey="label" lines={[{ key: "count" }]} />
          ) : (
            <SimpleBarChart data={result.data} xKey="label" yKey="count" glow />
          )
        ) : (
          <DataTable
            tableId="reports.run-result"
            columns={tableColumns}
            data={result.rows}
            clientPageSize={25}
            emptyMessage="No matching records."
          />
        )}
      </div>

      {showEdit && <ReportBuilderModal reportId={reportId} onClose={() => setShowEdit(false)} />}
      {showShare && <ShareReportModal reportId={reportId} reportName={report.name} onClose={() => setShowShare(false)} />}
      {showEmail && <EmailReportModal reportId={reportId} reportName={report.name} onClose={() => setShowEmail(false)} />}
      {showPdfPreview && <ReportPdfPreviewModal reportId={reportId} reportName={report.name} onClose={() => setShowPdfPreview(false)} />}
    </div>
  );
}
