import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { Asset } from "./AssetListPage";

interface CustomFieldValue {
  value: string | null;
  field: { fieldKey: string };
}

type HarnessAsset = Asset & { customFieldValues: CustomFieldValue[] };

function fieldMap(asset: HarnessAsset): Record<string, string | null> {
  return Object.fromEntries(asset.customFieldValues.map((v) => [v.field.fieldKey, v.value]));
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - Date.now()) / (24 * 60 * 60 * 1000));
}

function ExpiryCell({ dateStr }: { dateStr: string | null | undefined }) {
  if (!dateStr) return <span className="muted">—</span>;
  const days = daysUntil(dateStr);
  const cls = days === null ? "badge-neutral" : days < 0 ? "badge-danger" : days <= 30 ? "badge-warning" : "badge-success";
  const label = days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`;
  return (
    <span className="stack" style={{ gap: 2, fontSize: 11 }}>
      <span>{dateStr}</span>
      <span className={`badge ${cls}`} style={{ width: "fit-content" }}>{label}</span>
    </span>
  );
}

function TestCycleCell({ testDate, expiryDate }: { testDate: string | null | undefined; expiryDate: string | null | undefined }) {
  if (!testDate && !expiryDate) return <span className="muted">—</span>;
  return (
    <span className="stack" style={{ gap: 2, fontSize: 11 }}>
      {testDate && <span className="muted">Tested {testDate}</span>}
      <ExpiryCell dateStr={expiryDate} />
    </span>
  );
}

// Dedicated compliance-register view for the Harness category, laid out to match the source
// "Harness Certification Matrix" spreadsheet. Days-remaining is always computed live from the
// stored expiry dates rather than imported as a static number, so it never goes stale.
export function HarnessRegisterView({ categoryId, onEdit }: { categoryId: number; onEdit: (asset: HarnessAsset) => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["assets-harness-register", categoryId],
    queryFn: async () => (await axiosClient.get("/assets", { params: { categoryId, pageSize: 200 } })).data.items as HarnessAsset[],
  });

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="ad-table" style={{ minWidth: 1400 }}>
        <thead>
          <tr>
            <th>Make and Model</th>
            <th>Serial No.</th>
            <th>ID/Batch Number</th>
            <th>Test Cert No.</th>
            <th>Tester</th>
            <th>Notes</th>
            <th>Manufacture Date</th>
            <th>Life Span Expiry</th>
            <th>Test 1</th>
            <th>Test 2</th>
            <th>Test 3</th>
            <th>Purchased From</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.map((asset) => {
            const f = fieldMap(asset);
            return (
              <tr key={asset.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/assets/${asset.id}`)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{asset.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{asset.assetTag}</div>
                </td>
                <td>{asset.serialNumber ?? "—"}</td>
                <td>{f.id_batch_number ?? "—"}</td>
                <td>{f.test_cert_no ?? "—"}</td>
                <td>{f.tester ?? "—"}</td>
                <td style={{ maxWidth: 180 }}>{asset.notes ?? "—"}</td>
                <td>{f.manufacture_date ?? "—"}</td>
                <td><ExpiryCell dateStr={f.life_span_expiry_date} /></td>
                <td><TestCycleCell testDate={f.test_1_test_date} expiryDate={f.test_1_expiry_date} /></td>
                <td><TestCycleCell testDate={f.test_2_test_date} expiryDate={f.test_2_expiry_date} /></td>
                <td><TestCycleCell testDate={f.test_3_test_date} expiryDate={f.test_3_expiry_date} /></td>
                <td style={{ maxWidth: 200, fontSize: 11 }}>{f.purchased_from ?? "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => onEdit(asset)}>
                    <Icon name="edit" size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!isLoading && (data ?? []).length === 0 && (
        <div className="empty-state">
          <Icon name="assets" size={20} /> No harnesses registered yet.
        </div>
      )}
    </div>
  );
}
