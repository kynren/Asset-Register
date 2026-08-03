import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { Asset } from "./AssetListPage";
import { PermissionGate } from "../../auth/PermissionGate";

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
// "Harness Certification Matrix" spreadsheet — but built on the app's standard DataTable
// component (sorting, resizing, per-column filters, search) rather than a bespoke table, so it
// looks and behaves like every other data grid in the app. Days-remaining is always computed
// live from the stored expiry dates rather than imported as a static number, so it never goes
// stale.
export function HarnessRegisterView({ categoryId, onEdit }: { categoryId: number; onEdit: (asset: HarnessAsset) => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["assets-harness-register", categoryId],
    queryFn: async () => (await axiosClient.get("/assets", { params: { categoryId, pageSize: 200 } })).data.items as HarnessAsset[],
  });

  const columns: ColumnDef<HarnessAsset, any>[] = [
    {
      header: "Make and Model",
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.name}</div>
          <div className="muted" style={{ fontSize: 11 }}>{row.original.assetTag}</div>
        </div>
      ),
    },
    { header: "Serial No.", accessorFn: (r) => r.serialNumber ?? "—" },
    { header: "ID/Batch Number", accessorFn: (r) => fieldMap(r).id_batch_number ?? "—" },
    { header: "Test Cert No.", accessorFn: (r) => fieldMap(r).test_cert_no ?? "—" },
    { header: "Tester", accessorFn: (r) => fieldMap(r).tester ?? "—" },
    { header: "Notes", cell: ({ row }) => <span style={{ maxWidth: 180, display: "inline-block" }}>{row.original.notes ?? "—"}</span> },
    { header: "Manufacture Date", accessorFn: (r) => fieldMap(r).manufacture_date ?? "—" },
    { header: "Life Span Expiry", cell: ({ row }) => <ExpiryCell dateStr={fieldMap(row.original).life_span_expiry_date} /> },
    { header: "Test 1", cell: ({ row }) => <TestCycleCell testDate={fieldMap(row.original).test_1_test_date} expiryDate={fieldMap(row.original).test_1_expiry_date} /> },
    { header: "Test 2", cell: ({ row }) => <TestCycleCell testDate={fieldMap(row.original).test_2_test_date} expiryDate={fieldMap(row.original).test_2_expiry_date} /> },
    { header: "Test 3", cell: ({ row }) => <TestCycleCell testDate={fieldMap(row.original).test_3_test_date} expiryDate={fieldMap(row.original).test_3_expiry_date} /> },
    { header: "Purchased From", cell: ({ row }) => <span style={{ maxWidth: 200, fontSize: 11, display: "inline-block" }}>{fieldMap(row.original).purchased_from ?? "—"}</span> },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <PermissionGate module="harness" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => onEdit(row.original)}>
              <Icon name="edit" size={12} />
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        clientPageSize={15}
        onRowClick={(row) => navigate(`/harness/${row.id}`)}
        emptyMessage="No harnesses registered yet."
        searchPlaceholder="Search harnesses..."
      />
    </div>
  );
}
