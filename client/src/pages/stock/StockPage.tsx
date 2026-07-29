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
  const [tab, setTab] = useState<"register" | "analytics">("register");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [txItem, setTxItem] = useState<StockItem | null>(null);
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stock"] }); setShowForm(false); },
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
        <PermissionGate module="stock" action="edit">
          <button className="btn btn-secondary btn-sm" onClick={() => setTxItem(row.original)}>Log Transaction</button>
        </PermissionGate>
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
          <button className={`btn btn-sm ${tab === "register" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("register")}>Register</button>
          <button className={`btn btn-sm ${tab === "analytics" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("analytics")}>Analytics</button>
          <PermissionGate module="stock" action="create">
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> Add Item</button>
          </PermissionGate>
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
            <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
          </div>
        </>
      ) : (
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
      )}

      {showForm && <StockItemFormModal onClose={() => setShowForm(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />}
      {txItem && <TransactionModal item={txItem} onClose={() => setTxItem(null)} />}
    </div>
  );
}

function TransactionModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => axiosClient.post(`/stock/${item.id}/transactions`, { type, quantity, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-analytics"] });
      onClose();
    },
  });

  return (
    <FormModal title={`Log Transaction — ${item.name}`} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitLabel="Log">
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as "IN" | "OUT")}>
            <option value="IN">Stock In</option>
            <option value="OUT">Stock Out</option>
          </select>
        </div>
        <div className="field">
          <label>Quantity</label>
          <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
      </div>
      <div className="field">
        <label>Reason / Notes</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Issued to helpdesk repair" />
      </div>
      <p className="muted">Current stock: {item.quantityOnHand} {item.unit}</p>
    </FormModal>
  );
}
