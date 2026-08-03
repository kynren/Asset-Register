import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { Icon } from "../../components/Icon";
import { SimpleBarChart } from "../../components/ChartWrapper";
import { PermissionGate } from "../../auth/PermissionGate";
import { StockItemFormModal, StockItemFormValues } from "./StockItemFormModal";
import { FormModal } from "../../components/FormModal";
import { QrCodeModal } from "../../components/QrCodeModal";
import { ProcurementTab } from "./ProcurementTab";
import { ModuleDashboardTab } from "../dashboard/ModuleDashboardTab";
import { STOCK_WIDGET_CATALOG, DEFAULT_STOCK_DASHBOARD_LAYOUT } from "./stockDashboardWidgets";

interface StockItem {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
}

export function StockPage() {
  const [tab, setTab] = useState<"register" | "analytics" | "procurement" | "dashboard">("dashboard");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [txItem, setTxItem] = useState<StockItem | null>(null);
  const [qrItem, setQrItem] = useState<StockItem | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["stock", { search, lowStockOnly, page }],
    queryFn: async () =>
      (await axiosClient.get("/stock", { params: { search: search || undefined, lowStock: lowStockOnly || undefined, page, pageSize: 15 } })).data,
  });

  const { data: analytics } = useQuery({
    queryKey: ["stock-analytics"],
    queryFn: async () => (await axiosClient.get("/stock/analytics")).data,
    enabled: tab === "analytics",
  });

  const createMutation = useMutation({
    mutationFn: (values: StockItemFormValues) => axiosClient.post("/stock", values),
    meta: { successMessage: "Stock item created" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stock"] }); setShowForm(false); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/stock/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock"] }),
  });

  const columns: ColumnDef<StockItem, any>[] = [
    { header: "SKU", accessorKey: "sku" },
    { header: "Name", accessorKey: "name" },
    { header: "Category", accessorFn: (r) => r.category ?? "—" },
    {
      header: "On Hand",
      accessorFn: (r) => `${r.quantityOnHand} ${r.unit}`,
      cell: ({ row }) => (
        <span style={{ color: row.original.quantityOnHand <= row.original.reorderLevel ? "var(--color-danger)" : undefined, fontWeight: 600 }}>
          {row.original.quantityOnHand} {row.original.unit}
        </span>
      ),
    },
    { header: "Reorder Level", accessorKey: "reorderLevel" },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="stock" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => setTxItem(row.original)}>Manage Stock</button>
          </PermissionGate>
          <button className="btn btn-secondary btn-sm btn-icon" title="Print QR label" onClick={() => setQrItem(row.original)}><Icon name="grid" size={12} /></button>
          <PermissionGate module="stock" action="create">
            <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(row.original.id)}><Icon name="paperclip" size={12} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Register & Analytics</h1>
          <p className="page-subtitle">Track consumables, spare parts, and stock movement.</p>
        </div>
        <div className="row gap-2">
          <button className={`btn btn-sm ${tab === "dashboard" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={`btn btn-sm ${tab === "register" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("register")}>Register</button>
          <button className={`btn btn-sm ${tab === "analytics" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("analytics")}>Analytics</button>
          <button className={`btn btn-sm ${tab === "procurement" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("procurement")}>Suppliers & POs</button>
          {tab === "register" && (
            <PermissionGate module="stock" action="create">
              <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> Add Item</button>
            </PermissionGate>
          )}
        </div>
      </div>

      {tab === "register" ? (
        <>
          <FilterBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search by SKU or name...">
            <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={lowStockOnly} onChange={(e) => { setLowStockOnly(e.target.checked); setPage(1); }} />
              Low stock only
            </label>
          </FilterBar>
          <div className="card">
            <DataTable tableId="stock.items" columns={columns} data={data?.items ?? []} isLoading={isLoading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
          </div>
        </>
      ) : tab === "analytics" ? (
        <div className="stack gap-3">
          <div className="grid grid-cols-2">
            <div className="card">
              <h3 className="mt-0">Top Consumed Items</h3>
              {analytics?.topConsumed?.length ? (
                <SimpleBarChart data={analytics.topConsumed} xKey="name" yKey="quantity" />
              ) : (
                <div className="empty-state">No consumption data yet.</div>
              )}
            </div>
            <div className="card">
              <h3 className="mt-0">Stock Movement Trend</h3>
              {analytics?.trend?.length ? (
                <SimpleBarChart data={analytics.trend} xKey="date" yKey="out" />
              ) : (
                <div className="empty-state">No transactions logged yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : tab === "procurement" ? (
        <ProcurementTab />
      ) : (
        <ModuleDashboardTab
          module="stock"
          catalog={STOCK_WIDGET_CATALOG}
          defaultLayout={DEFAULT_STOCK_DASHBOARD_LAYOUT}
          title="Stock Register & Analytics"
          showHeader={false}
        />
      )}

      {showForm && <StockItemFormModal onClose={() => setShowForm(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />}
      {txItem && <StockLevelsModal item={txItem} onClose={() => setTxItem(null)} />}
      {qrItem && <QrCodeModal title="Stock Item QR Label" value={qrItem.sku} label={qrItem.sku} subLabel={qrItem.name} onClose={() => setQrItem(null)} />}
    </div>
  );
}

interface StockLevel {
  id: number;
  locationId: number;
  quantityOnHand: number;
  location: { id: number; name: string };
}

function StockLevelsModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [mode, setMode] = useState<"move" | "transfer">("move");
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [locationId, setLocationId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const { data: detail } = useQuery({
    queryKey: ["stock-item-detail", item.id],
    queryFn: async () => (await axiosClient.get(`/stock/${item.id}`)).data,
  });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["stock-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["stock-item-detail", item.id] });
  };

  const txMutation = useMutation({
    mutationFn: () => axiosClient.post(`/stock/${item.id}/transactions`, { type, quantity, locationId: Number(locationId), reason: reason || undefined }),
    meta: { successMessage: "Stock transaction recorded" },
    onSuccess: () => { invalidateAll(); setQuantity(1); setReason(""); },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/stock/${item.id}/transfer`, { fromLocationId: Number(fromLocationId), toLocationId: Number(toLocationId), quantity, reason: reason || undefined }),
    meta: { successMessage: "Stock transferred" },
    onSuccess: () => { invalidateAll(); setQuantity(1); setReason(""); },
  });

  const activeMutation = mode === "move" ? txMutation : transferMutation;
  const canSubmit = mode === "move" ? !!locationId && quantity > 0 : !!fromLocationId && !!toLocationId && fromLocationId !== toLocationId && quantity > 0;

  const levels: StockLevel[] = detail?.stockLevels ?? [];

  return (
    <FormModal
      title={`Stock Movement — ${item.name}`}
      onClose={onClose}
      onSubmit={() => activeMutation.mutate()}
      submitting={activeMutation.isPending}
      submitLabel={mode === "move" ? "Log Movement" : "Transfer Stock"}
      submitDisabled={!canSubmit}
    >
      {activeMutation.isError && <div className="alert alert-danger">{(activeMutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}

      <div className="field">
        <label>By Location</label>
        {levels.length > 0 ? (
          <table className="ad-table" style={{ marginBottom: 12 }}>
            <thead><tr><th>Location</th><th>On Hand</th></tr></thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id}><td>{l.location.name}</td><td>{l.quantityOnHand} {item.unit}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No stock recorded at any location yet. Log a "Stock In" to add initial quantity.</p>
        )}
      </div>

      <div className="row gap-2" style={{ marginBottom: 12 }}>
        <button type="button" className={`btn btn-sm ${mode === "move" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("move")}>Stock In / Out</button>
        <button type="button" className={`btn btn-sm ${mode === "transfer" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("transfer")}>Transfer</button>
      </div>

      {mode === "move" ? (
        <div className="grid grid-cols-2">
          <div className="field">
            <label>Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as "IN" | "OUT")}>
              <option value="IN">Stock In</option>
              <option value="OUT">Stock Out</option>
            </select>
          </div>
          <div className="field">
            <label>Location</label>
            <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select location...</option>
              {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2">
          <div className="field">
            <label>From Location</label>
            <select className="select" value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
              <option value="">Select location...</option>
              {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>To Location</label>
            <select className="select" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              <option value="">Select location...</option>
              {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label>Quantity</label>
        <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Reason / Notes</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Issued to helpdesk repair" />
      </div>
      <p className="muted">Total across all locations: {detail?.quantityOnHand ?? item.quantityOnHand} {item.unit}</p>
    </FormModal>
  );
}
