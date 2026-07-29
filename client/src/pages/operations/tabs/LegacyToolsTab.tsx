import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { CsvImportButton } from "../../../components/CsvButtons";
import { PermissionGate } from "../../../auth/PermissionGate";

const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];
const REPORTS = [
  { type: "assets", label: "Asset Register Report" },
  { type: "stock", label: "Stock Register Report" },
  { type: "tickets", label: "Helpdesk Ticket Report" },
];

export function LegacyToolsTab() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState("IN_STORAGE");
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  const queryClient = useQueryClient();

  const { data: assets } = useQuery({
    queryKey: ["assets-for-bulk"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 100 } })).data.items,
  });

  const { data: dueAssets } = useQuery({
    queryKey: ["maintenance-due"],
    queryFn: async () => (await axiosClient.get("/operations/maintenance-due")).data,
  });

  const bulkMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/bulk-status", { assetIds: selectedIds, status: bulkStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets-for-bulk"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setSelectedIds([]);
    },
  });

  function toggleSelected(id: number) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function downloadReport(type: string, format: "csv" | "pdf") {
    const res = await axiosClient.get(`/operations/reports/${type}`, { params: { format }, responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-report.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="stack gap-3">
      <PermissionGate module="operations" action="edit">
        <div className="ad-panel">
          <div className="ad-panel-title">Bulk Asset Status Update</div>
          <div className="row gap-2" style={{ marginBottom: 12 }}>
            <select className="ad-select" style={{ width: "auto" }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <button className="ad-btn ad-btn-primary" disabled={selectedIds.length === 0 || bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>
              Apply to {selectedIds.length} selected
            </button>
            <CsvImportButton url="/assets/import" onImported={(res) => { setImportResult(res); queryClient.invalidateQueries({ queryKey: ["assets-for-bulk"] }); }} />
          </div>
          {importResult && (
            <div className={`ad-badge ${importResult.errors.length ? "ad-badge-warning" : "ad-badge-success"}`} style={{ display: "block", width: "fit-content", marginBottom: 12 }}>
              Imported {importResult.created} asset(s). {importResult.errors.length > 0 && `${importResult.errors.length} row(s) had errors.`}
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <table className="ad-table">
              <thead><tr><th></th><th>Asset Tag</th><th>Name</th><th>Status</th></tr></thead>
              <tbody>
                {assets?.map((a: any) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelected(a.id)} /></td>
                    <td>{a.assetTag}</td>
                    <td>{a.name}</td>
                    <td>{a.status.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PermissionGate>

      <PermissionGate module="operations" action="export">
        <div className="ad-panel">
          <div className="ad-panel-title">Report Generator</div>
          <div className="stack gap-2">
            {REPORTS.map((r) => (
              <div key={r.type} className="ad-row-card">
                <span className="ad-row-value">{r.label}</span>
                <div className="row gap-2">
                  <button className="ad-btn" onClick={() => downloadReport(r.type, "csv")}><Icon name="download" size={13} /> CSV</button>
                  <button className="ad-btn" onClick={() => downloadReport(r.type, "pdf")}><Icon name="download" size={13} /> PDF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PermissionGate>

      <div className="ad-panel">
        <div className="ad-panel-title">Maintenance Due</div>
        {dueAssets?.length ? (
          <table className="ad-table">
            <thead><tr><th>Asset Tag</th><th>Name</th><th>Next Service</th><th>Assigned To</th></tr></thead>
            <tbody>
              {dueAssets.map((a: any) => (
                <tr key={a.id}>
                  <td>{a.assetTag}</td>
                  <td>{a.name}</td>
                  <td>{dayjs(a.nextServiceDate).format("DD MMM YYYY")}</td>
                  <td>{a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ad-empty">No assets are currently due for maintenance.</div>
        )}
      </div>
    </div>
  );
}
