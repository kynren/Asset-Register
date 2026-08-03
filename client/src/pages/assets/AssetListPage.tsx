import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, UseMutationResult } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { NavigateFunction, useNavigate, useSearchParams } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { CsvExportButton } from "../../components/CsvButtons";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate, usePermission } from "../../auth/PermissionGate";
import { AssetFormModal, AssetFormValues } from "./AssetFormModal";
import { AssetGridCard } from "./AssetGridCard";
import { QrLabelModal } from "./QrLabelModal";
import { QrScannerModal } from "./QrScannerModal";
import { DiscoverDevicesModal } from "./DiscoverDevicesModal";
import { AssetImportWizardModal } from "./AssetImportWizardModal";
import { AssetTelemetryCell } from "./AssetTelemetryCell";
import { Skeleton } from "../../components/Skeleton";
import { CategoryTabBar } from "../docs/CategoryTabBar";
import { AssetCollectionsManageModal } from "./AssetCollectionsManageModal";

export interface Asset {
  id: number;
  assetTag: string;
  name: string;
  status: string;
  signOffStatus: string;
  categoryId: number | null;
  category: { name: string } | null;
  locationId: number | null;
  location: { name: string } | null;
  assignedToId: number | null;
  assignedTo: { id: number; firstName: string; lastName: string } | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  nextServiceDate: string | null;
  notes: string | null;
  device: { lastSeen: string; batteryPresent: boolean | null; batteryPercent: number | null; batteryCharging: boolean | null } | null;
  featuredImageUrl: string | null;
  gridPowered: boolean;
  remoteManagementEnabled: boolean;
}

const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];

export function AssetListPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(searchParams.get("categoryId") ? Number(searchParams.get("categoryId")) : null);
  const [assignedToId, setAssignedToId] = useState(searchParams.get("assignedToId") ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState("IN_STORAGE");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [activeCollection, setActiveCollection] = useState("");
  const [showManageCollections, setShowManageCollections] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = usePermission("assets", "edit");

  // Topbar search (and any other cross-page link) navigates to /assets?search=... via SPA
  // routing, which reuses this already-mounted component and only changes the query string —
  // the useState initializers above never re-run in that case, so without this the filter bar
  // stays stuck on whatever it showed before the second search.
  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setStatus(searchParams.get("status") ?? "");
    setCategoryId(searchParams.get("categoryId") ? Number(searchParams.get("categoryId")) : null);
    setAssignedToId(searchParams.get("assignedToId") ?? "");
  }, [searchParams]);

  const filters = { search: search || undefined, status: status || undefined, assignedToId: assignedToId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  const { data: stats } = useQuery({
    queryKey: ["asset-stats"],
    queryFn: async () => (await axiosClient.get("/assets/stats")).data as { total: number; byCategory: { categoryId: number | null; name: string; count: number }[] },
  });

  const { data: allCategories } = useQuery({ queryKey: ["asset-categories"], queryFn: async () => (await axiosClient.get("/asset-categories")).data });
  const categories = allCategories;

  const { data: collections } = useQuery({
    queryKey: ["asset-collections"],
    queryFn: async () => (await axiosClient.get("/asset-collections")).data as { id: number; name: string; description: string | null; categoryCount: number }[],
  });
  // Sums each category's asset count into its parent collection so the Collections tab bar shows
  // real per-collection totals, mirroring how the category chip row below sums per-category.
  const collectionCounts = new Map<number, number>();
  for (const s of stats?.byCategory ?? []) {
    const collectionId = allCategories?.find((c: any) => c.id === s.categoryId)?.collectionId;
    if (collectionId != null) collectionCounts.set(collectionId, (collectionCounts.get(collectionId) ?? 0) + s.count);
  }
  const collectionTabs = (collections ?? []).map((c) => ({ name: c.name, count: collectionCounts.get(c.id) ?? 0 }));
  const activeCollectionCategoryIds = new Set((allCategories ?? []).filter((c: any) => c.collection?.name === activeCollection).map((c: any) => c.id));
  const visibleCategories = activeCollection ? categories?.filter((c: any) => activeCollectionCategoryIds.has(c.id)) : categories;
  // Each category renders as its own card + table below — "All Assets" shows every visible
  // category's table stacked; selecting one chip narrows the stack down to just that category.
  const categoriesToShow = categoryId != null ? (categories ?? []).filter((c: any) => c.id === categoryId) : visibleCategories ?? [];
  // "All Assets" badge sums only the categories currently shown in the chip row (i.e. scoped to
  // whichever collection is active), so it always matches what's actually rendered below rather
  // than a separate, potentially-drifting org-wide total.
  const visibleAssetsTotal = (visibleCategories ?? []).reduce((sum: number, c: any) => sum + (stats?.byCategory.find((s) => s.categoryId === c.id)?.count ?? 0), 0);

  function selectCollection(name: string) {
    setActiveCollection(name);
    setCategoryId(null);
  }
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: unregisteredData } = useQuery({
    queryKey: ["devices-unregistered-count"],
    queryFn: async () => (await axiosClient.get("/devices", { params: { unregistered: true, pageSize: 1 } })).data,
  });

  const createMutation = useMutation({
    mutationFn: (values: AssetFormValues) => axiosClient.post("/assets", toPayload(values)),
    meta: { successMessage: "Asset created" },
    onSuccess: () => { invalidateAll(); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (values: AssetFormValues) => axiosClient.patch(`/assets/${editing!.id}`, toPayload(values)),
    meta: { successMessage: "Asset updated" },
    onSuccess: () => { invalidateAll(); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/assets/${deleting!.id}`),
    meta: { successMessage: "Asset deleted" },
    onSuccess: () => { invalidateAll(); setDeleting(null); },
  });

  const quickPatchMutation = useMutation({
    mutationFn: (params: { id: number; data: Record<string, unknown> }) => axiosClient.patch(`/assets/${params.id}`, params.data),
    onSuccess: () => invalidateAll(),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/assets/${id}/duplicate`),
    onSuccess: () => invalidateAll(),
  });

  const bulkMutation = useMutation({
    mutationFn: () => Promise.all(selectedIds.map((id) => axiosClient.patch(`/assets/${id}`, { status: bulkStatus }))),
    onSuccess: () => { invalidateAll(); setSelectedIds([]); },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["asset-stats"] });
  }

  function toPayload(values: AssetFormValues) {
    return { ...values, nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null };
  }

  async function copyShareLink(asset: Asset) {
    await navigator.clipboard.writeText(`${window.location.origin}/assets/${asset.id}`);
  }

  async function downloadJson() {
    const res = await axiosClient.get("/assets/export.json", { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assets.json";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Remounts every category section (resetting its own page back to 1) whenever a filter that
  // changes the underlying result set changes — cheaper and simpler than wiring a reset effect
  // into each section individually.
  const filtersKey = JSON.stringify({ ...filters, viewMode });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Asset Inventory</h1>
          <p className="page-subtitle">Track and manage all Kynren IT and physical assets.</p>
        </div>
        <PermissionGate module="assets" action="create">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> Add Hardware Asset</button>
        </PermissionGate>
      </div>

      <CategoryTabBar categories={collectionTabs} active={activeCollection} onSelect={selectCollection} allCount={collectionTabs.length} />

      <div className="row gap-2 flex-wrap" style={{ marginTop: 16, marginBottom: 14, paddingBottom: 30 }}>
        <button className={`btn btn-sm ${categoryId === null ? "btn-primary" : "btn-secondary"}`} onClick={() => setCategoryId(null)}>
          All Assets <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{visibleAssetsTotal}</span>
        </button>
        {visibleCategories?.map((c: any) => {
          const count = stats?.byCategory.find((s) => s.categoryId === c.id)?.count ?? 0;
          return (
            <button key={c.id} className={`btn btn-sm ${categoryId === c.id ? "btn-primary" : "btn-secondary"}`} onClick={() => setCategoryId(c.id)}>
              {c.name} <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{count}</span>
            </button>
          );
        })}
        <PermissionGate module="admin" action="edit">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/admin")}><Icon name="plus" size={12} /> Add Asset Type</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowManageCollections(true)}><Icon name="grid" size={12} /> Manage Collections</button>
        </PermissionGate>
      </div>

      <div className="filter-bar">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: "var(--color-text-muted)" }}><Icon name="search" size={14} /></span>
          <input className="input" style={{ paddingLeft: 30, minWidth: 220 }} placeholder="Search by tag, name, or serial..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select className="select" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
          <option value="">Custody: All</option>
          {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </select>
        <input className="input" type="date" style={{ width: "auto" }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
        <input className="input" type="date" style={{ width: "auto" }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
        <div className="flex-1" />
        <button className="btn btn-secondary" onClick={() => window.print()}><Icon name="download" size={13} /> Print Inventory</button>
        <button className="btn btn-secondary" onClick={downloadJson}><Icon name="download" size={13} /> Export JSON</button>
        <button className="btn btn-secondary" onClick={() => setShowScanner(true)}><Icon name="grid" size={13} /> Scan QR Code</button>
        <PermissionGate module="assets" action="create">
          <button className="btn btn-secondary" onClick={() => setShowDiscover(true)}>
            <Icon name="cpu" size={13} /> Discover Unregistered Assets
            {Boolean(unregisteredData?.total) && <span className="badge badge-warning" style={{ marginLeft: 6 }}>{unregisteredData.total}</span>}
          </button>
        </PermissionGate>
        <PermissionGate module="assets" action="export">
          <CsvExportButton url="/assets/export" filename="assets.csv" />
        </PermissionGate>
        <PermissionGate module="assets" action="create">
          <button className="btn btn-secondary" onClick={() => setShowImportWizard(true)}>
            <Icon name="upload" size={14} /> Import CSV
          </button>
        </PermissionGate>
        <div className="row gap-1">
          <button className={`btn btn-sm btn-icon ${viewMode === "list" ? "btn-primary" : "btn-secondary"}`} onClick={() => setViewMode("list")} title="List view"><Icon name="grid" size={13} /></button>
          <button className={`btn btn-sm btn-icon ${viewMode === "grid" ? "btn-primary" : "btn-secondary"}`} onClick={() => setViewMode("grid")} title="Grid view"><Icon name="camera" size={13} /></button>
        </div>
      </div>

      {showImportWizard && (
        <AssetImportWizardModal onClose={() => setShowImportWizard(false)} onImported={invalidateAll} />
      )}

      {canEdit && selectedIds.length > 0 && (
        <div className="alert alert-primary row gap-2" style={{ alignItems: "center", background: "var(--color-primary-soft)" }}>
          <strong>{selectedIds.length} selected</strong>
          <select className="select" style={{ width: "auto" }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>Apply Status</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      <div id="inventory-print-area">
        {categoriesToShow.length === 0 && <div className="empty-state">No asset categories to show.</div>}
        {categoriesToShow.map((c: any) => (
          <CategoryAssetsSection
            key={`${c.id}:${filtersKey}`}
            category={c}
            filters={filters}
            viewMode={viewMode}
            canEdit={canEdit}
            users={users}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            quickPatchMutation={quickPatchMutation}
            duplicateMutation={duplicateMutation}
            navigate={navigate}
            onEdit={setEditing}
            onDelete={setDeleting}
            onQr={setQrAsset}
            copyShareLink={copyShareLink}
          />
        ))}
      </div>

      {showForm && (
        <AssetFormModal onClose={() => setShowForm(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}
      {editing && (
        <AssetFormModal
          assetId={editing.id}
          featuredImageUrl={editing.featuredImageUrl}
          initial={{
            assetTag: editing.assetTag,
            name: editing.name,
            status: editing.status,
            categoryId: editing.categoryId,
            locationId: editing.locationId,
            assignedToId: editing.assignedToId,
            manufacturer: editing.manufacturer ?? "",
            model: editing.model ?? "",
            serialNumber: editing.serialNumber ?? "",
            notes: editing.notes ?? "",
            nextServiceDate: editing.nextServiceDate ? editing.nextServiceDate.slice(0, 10) : "",
            gridPowered: editing.gridPowered,
            remoteManagementEnabled: editing.remoteManagementEnabled,
          }}
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete asset"
          message={`Are you sure you want to delete "${deleting.name}" (${deleting.assetTag})? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
      {qrAsset && <QrLabelModal assetTag={qrAsset.assetTag} name={qrAsset.name} onClose={() => setQrAsset(null)} />}
      {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} />}
      {showDiscover && <DiscoverDevicesModal onClose={() => setShowDiscover(false)} />}
      {showManageCollections && <AssetCollectionsManageModal onClose={() => setShowManageCollections(false)} />}
    </div>
  );
}

interface CategoryAssetsSectionProps {
  category: { id: number; name: string };
  filters: Record<string, unknown>;
  viewMode: "list" | "grid";
  canEdit: boolean;
  users: any[] | undefined;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  quickPatchMutation: UseMutationResult<any, any, { id: number; data: Record<string, unknown> }>;
  duplicateMutation: UseMutationResult<any, any, number>;
  navigate: NavigateFunction;
  onEdit: (a: Asset) => void;
  onDelete: (a: Asset) => void;
  onQr: (a: Asset) => void;
  copyShareLink: (a: Asset) => void;
}

// One card + table per asset category, each with its own server-paginated query — the Asset
// Inventory page renders one of these per visible category instead of a single flat, filterable
// table.
function CategoryAssetsSection({
  category,
  filters,
  viewMode,
  canEdit,
  users,
  selectedIds,
  onSelectedIdsChange,
  quickPatchMutation,
  duplicateMutation,
  navigate,
  onEdit,
  onDelete,
  onQr,
  copyShareLink,
}: CategoryAssetsSectionProps) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["assets", { ...filters, categoryId: category.id, page, viewMode }],
    queryFn: async () =>
      (await axiosClient.get("/assets", { params: { ...filters, categoryId: category.id, page, pageSize: viewMode === "grid" ? 24 : 15 } })).data,
  });

  const columns: ColumnDef<Asset, any>[] = useMemo(
    () => [
      {
        header: "Asset",
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 600 }}>{row.original.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>{row.original.assetTag}{row.original.serialNumber ? ` · SN ${row.original.serialNumber}` : ""}</div>
          </div>
        ),
      },
      {
        header: "Status",
        cell: ({ row }) =>
          canEdit ? (
            <select
              className="select"
              style={{ fontSize: 12, padding: "4px 6px" }}
              value={row.original.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => quickPatchMutation.mutate({ id: row.original.id, data: { status: e.target.value } })}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          ) : (
            <StatusBadge status={row.original.status} />
          ),
      },
      { header: "Location", accessorFn: (r) => r.location?.name ?? "—" },
      {
        header: "Power",
        cell: ({ row }) => {
          const a = row.original;
          if (a.gridPowered) {
            return (
              <span className="badge badge-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="plug" size={11} /> Grid
              </span>
            );
          }
          const battery = a.device;
          if (!battery || battery.batteryPresent !== true || battery.batteryPercent == null) {
            return <span className="muted" style={{ fontSize: 12 }}>—</span>;
          }
          const level = battery.batteryPercent;
          const color = level <= 20 ? "var(--color-danger)" : level <= 50 ? "var(--color-warning)" : "var(--color-success)";
          return (
            <span
              className="row gap-1"
              style={{ fontSize: 12, alignItems: "center", color }}
              title={battery.batteryCharging ? "Charging" : "On battery"}
            >
              <Icon name="battery" size={13} />
              {level}%{battery.batteryCharging ? " ⚡" : ""}
            </span>
          );
        },
      },
      {
        header: "Telemetry",
        cell: ({ row }) => <AssetTelemetryCell assetId={row.original.id} />,
      },
      {
        header: "Custodian",
        cell: ({ row }) =>
          canEdit ? (
            <select
              className="select"
              style={{ fontSize: 12, padding: "4px 6px" }}
              value={row.original.assignedToId ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => quickPatchMutation.mutate({ id: row.original.id, data: { assignedToId: e.target.value ? Number(e.target.value) : null } })}
            >
              <option value="">Unassigned</option>
              {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          ) : (
            <span>{row.original.assignedTo ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName}` : "Unassigned"}</span>
          ),
      },
      {
        header: "Sign-off",
        cell: ({ row }) => (
          <button
            className={`badge ${row.original.signOffStatus === "CONFIRMED" ? "badge-success" : "badge-warning"}`}
            style={{ border: "none", cursor: canEdit ? "pointer" : "default" }}
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              quickPatchMutation.mutate({ id: row.original.id, data: { signOffStatus: row.original.signOffStatus === "CONFIRMED" ? "PENDING" : "CONFIRMED" } });
            }}
          >
            {row.original.signOffStatus}
          </button>
        ),
      },
      {
        header: "",
        id: "actions",
        cell: ({ row }) => (
          <div className="row gap-1" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-secondary btn-sm btn-icon" title="View" onClick={() => navigate(`/assets/${row.original.id}`)}><Icon name="search" size={12} /></button>
            <PermissionGate module="assets" action="edit">
              <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => onEdit(row.original)}><Icon name="edit" size={12} /></button>
            </PermissionGate>
            <button className="btn btn-secondary btn-sm btn-icon" title="Print QR label" onClick={() => onQr(row.original)}><Icon name="grid" size={12} /></button>
            <PermissionGate module="assets" action="create">
              <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(row.original.id)}><Icon name="paperclip" size={12} /></button>
            </PermissionGate>
            <button className="btn btn-secondary btn-sm btn-icon" title="Copy share link" onClick={() => copyShareLink(row.original)}><Icon name="chevronRight" size={12} /></button>
            <PermissionGate module="assets" action="delete">
              <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => onDelete(row.original)}><Icon name="trash" size={12} /></button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [canEdit, users, quickPatchMutation, duplicateMutation, navigate, onEdit, onQr, onDelete, copyShareLink]
  );

  return (
    <div className="card" style={{ marginBottom: 40 }}>
      <h3 className="mt-0 mb-0" style={{ marginBottom: 12 }}>
        {category.name} <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{data?.total ?? 0}</span>
      </h3>
      {viewMode === "grid" ? (
        <div className="grid grid-cols-4">
          {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={140} />)}
          {!isLoading && (data?.items ?? []).map((a: Asset) => (
            <AssetGridCard key={a.id} asset={a} onOpen={() => navigate(`/assets/${a.id}`)} />
          ))}
          {(data?.items ?? []).length === 0 && !isLoading && <div className="empty-state">No {category.name} assets found.</div>}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/assets/${row.id}`)}
          selection={{
            selectedIds: new Set(selectedIds),
            onSelectedIdsChange: (next) => onSelectedIdsChange(Array.from(next)),
            getRowId: (a) => a.id,
          }}
          emptyMessage={`No ${category.name} assets found.`}
        />
      )}
    </div>
  );
}
