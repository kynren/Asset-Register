import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { AssetDetail } from "./detail/types";
import { AssetFormModal, AssetFormValues } from "./AssetFormModal";

function fieldMap(asset: AssetDetail): Record<string, string | null> {
  return Object.fromEntries((asset.customFieldValues ?? []).map((v) => [v.field.fieldKey, v.value]));
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - Date.now()) / (24 * 60 * 60 * 1000));
}

function StatusBadge({ dateStr }: { dateStr: string | null | undefined }) {
  if (!dateStr) return <span className="ad-badge ad-badge-neutral">No date on record</span>;
  const days = daysUntil(dateStr);
  if (days === null) return <span className="ad-badge ad-badge-neutral">Invalid date</span>;
  const cls = days < 0 ? "ad-badge-danger" : days <= 30 ? "ad-badge-warning" : "ad-badge-success";
  const label = days < 0 ? `Overdue by ${Math.abs(days)}d` : `${days}d remaining`;
  return <span className={`ad-badge ${cls}`}>{label}</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="ad-row-card">
      <div><div className="ad-row-label">{label}</div><div className="ad-row-value">{value}</div></div>
    </div>
  );
}

// Purpose-built detail page for the Harness category — a compliance register layout (identity,
// life span, full test-cycle history, certification report) instead of the generic IT-asset
// tabbed page (Impact Analysis, Software, Virtualization, etc. don't apply to safety harnesses).
export function HarnessDetailPage({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const f = fieldMap(asset);

  const updateMutation = useMutation({
    mutationFn: (values: AssetFormValues) => axiosClient.patch(`/assets/${asset.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", String(asset.id)] });
      onUpdated();
      setEditing(false);
    },
  });

  async function downloadReport() {
    const res = await axiosClient.get(`/assets/${asset.id}/harness-report/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harness-${asset.assetTag}-certification.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const cycles = [
    { label: "Test 1", testDate: f.test_1_test_date, expiryDate: f.test_1_expiry_date },
    { label: "Test 2", testDate: f.test_2_test_date, expiryDate: f.test_2_expiry_date },
    { label: "Test 3", testDate: f.test_3_test_date, expiryDate: f.test_3_expiry_date },
  ].filter((c) => c.testDate || c.expiryDate);

  const overallOverdue =
    (daysUntil(f.life_span_expiry_date) ?? 0) < 0 || cycles.some((c) => (daysUntil(c.expiryDate) ?? 0) < 0);

  return (
    <div className="ad-shell">
      <div className="ad-header">
        <div className="ad-header-left">
          <button className="ad-back-btn" onClick={() => navigate("/assets")} title="Back to Asset Inventory">
            <Icon name="arrowLeft" size={16} />
          </button>
          <div className="ad-title-block">
            <div className="ad-title-row">
              <h1 className="ad-title">{asset.name}</h1>
              <span className="ad-tag-badge">{asset.assetTag}</span>
            </div>
            <div className="ad-meta-row">
              <span>Category: <strong>Harness</strong></span>
              <span>Serial: <strong>{asset.serialNumber ?? "—"}</strong></span>
            </div>
          </div>
        </div>
        <div className="ad-header-right">
          <div className={`ad-active-badge ${overallOverdue ? "inactive" : ""}`}>
            {overallOverdue ? "NON-COMPLIANT" : "COMPLIANT"}
          </div>
        </div>
      </div>

      <div style={{ padding: 22 }}>
        <div className="row gap-2" style={{ marginBottom: 16, justifyContent: "flex-end" }}>
          <button className="ad-btn" onClick={() => setEditing(true)}>
            <Icon name="edit" size={13} /> Edit Harness
          </button>
          <button className="ad-btn ad-btn-primary" onClick={downloadReport}>
            <Icon name="download" size={13} /> Download Certification Report
          </button>
        </div>

        <div className="ad-grid">
          <div className="ad-panel">
            <div className="ad-panel-title">Identity</div>
            <Row label="Make and Model" value={asset.name} />
            <Row label="Serial Number" value={asset.serialNumber ?? "—"} />
            <Row label="ID/Batch Number" value={f.id_batch_number ?? "—"} />
            <Row label="Test Cert No." value={f.test_cert_no ?? "—"} />
            <Row label="Tester" value={f.tester ?? "—"} />
            <Row label="Purchased From" value={f.purchased_from ?? "—"} />
            {asset.notes && <Row label="Notes" value={asset.notes} />}
          </div>

          <div className="ad-panel">
            <div className="ad-panel-title">Life Span</div>
            <Row label="Manufacture Date" value={f.manufacture_date ?? "—"} />
            <div className="ad-row-card">
              <div>
                <div className="ad-row-label">Life Span Expiry Date</div>
                <div className="ad-row-value">{f.life_span_expiry_date ?? "—"}</div>
              </div>
              <StatusBadge dateStr={f.life_span_expiry_date} />
            </div>
          </div>

          <div className="ad-panel" style={{ gridColumn: "1 / -1" }}>
            <div className="ad-panel-title">Test History — All Tests on Record</div>
            {cycles.length > 0 ? (
              <table className="ad-table">
                <thead>
                  <tr><th>Cycle</th><th>Test Date</th><th>Expiry Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td>{c.testDate ?? "—"}</td>
                      <td>{c.expiryDate ?? "—"}</td>
                      <td><StatusBadge dateStr={c.expiryDate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="ad-empty">No test cycles recorded for this harness yet.</div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <AssetFormModal
          assetId={asset.id}
          featuredImageUrl={asset.featuredImageUrl}
          initial={{
            assetTag: asset.assetTag,
            name: asset.name,
            status: asset.status,
            categoryId: asset.categoryId,
            locationId: asset.locationId,
            assignedToId: asset.assignedToId,
            manufacturer: asset.manufacturer ?? "",
            model: asset.model ?? "",
            serialNumber: asset.serialNumber ?? "",
            notes: asset.notes ?? "",
            nextServiceDate: asset.nextServiceDate ? asset.nextServiceDate.slice(0, 10) : "",
            gridPowered: asset.gridPowered,
            remoteManagementEnabled: asset.remoteManagementEnabled,
          }}
          onClose={() => setEditing(false)}
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      )}
    </div>
  );
}
