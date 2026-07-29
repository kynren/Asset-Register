import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { FormModal } from "../../components/FormModal";
import { PermissionGate } from "../../auth/PermissionGate";
import { SkeletonText } from "../../components/Skeleton";

interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  _count: { purchaseOrders: number };
}

interface PoItem {
  id: number;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: string | null;
  stockItem: { id: number; sku: string; name: string; unit: string };
}

interface PurchaseOrder {
  id: number;
  poNumber: string;
  status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
  orderedAt: string | null;
  expectedAt: string | null;
  notes: string | null;
  supplier: { id: number; name: string };
  createdBy: { id: number; firstName: string; lastName: string };
  items: PoItem[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "ad-badge-neutral",
  ORDERED: "ad-badge-warning",
  RECEIVED: "ad-badge-success",
  CANCELLED: "ad-badge-danger",
};

export function ProcurementTab() {
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showPoForm, setShowPoForm] = useState(false);
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const queryClient = useQueryClient();

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await axiosClient.get("/procurement/suppliers")).data as Supplier[],
  });
  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => (await axiosClient.get("/procurement/purchase-orders")).data as PurchaseOrder[],
  });

  const markOrderedMutation = useMutation({
    mutationFn: (id: number) => axiosClient.patch(`/procurement/purchase-orders/${id}`, { status: "ORDERED" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: number) => axiosClient.patch(`/procurement/purchase-orders/${id}`, { status: "CANCELLED" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Suppliers</h3>
          <PermissionGate module="stock" action="create">
            <button className="btn btn-primary btn-sm" onClick={() => setShowSupplierForm(true)}><Icon name="plus" size={13} /> Add Supplier</button>
          </PermissionGate>
        </div>
        {suppliers && suppliers.length > 0 ? (
          <table className="ad-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Orders</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.contactName ?? "—"}</td>
                  <td>{s.email ?? "—"}</td>
                  <td>{s.phone ?? "—"}</td>
                  <td>{s._count.purchaseOrders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No suppliers registered yet.</div>
        )}
      </div>

      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Purchase Orders</h3>
          <PermissionGate module="stock" action="create">
            <button className="btn btn-primary btn-sm" disabled={!suppliers?.length} onClick={() => setShowPoForm(true)}>
              <Icon name="plus" size={13} /> New Purchase Order
            </button>
          </PermissionGate>
        </div>
        {isLoading ? (
          <div className="stack gap-2"><SkeletonText lines={3} /></div>
        ) : orders && orders.length > 0 ? (
          <div className="stack gap-2">
            {orders.map((po) => {
              const totalOrdered = po.items.reduce((s, i) => s + i.quantityOrdered, 0);
              const totalReceived = po.items.reduce((s, i) => s + i.quantityReceived, 0);
              return (
                <div key={po.id} className="ad-panel">
                  <div className="row gap-2" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div className="row gap-2">
                        <strong style={{ fontSize: 13 }}>{po.poNumber}</strong>
                        <span className={`ad-badge ${STATUS_COLORS[po.status]}`}>{po.status}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{po.supplier.name}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                        {totalReceived}/{totalOrdered} units received
                        {po.expectedAt && ` · Expected ${dayjs(po.expectedAt).format("DD MMM YYYY")}`}
                      </div>
                    </div>
                    <div className="row gap-1">
                      <PermissionGate module="stock" action="edit">
                        {po.status === "DRAFT" && (
                          <button className="ad-btn ad-btn-primary" disabled={markOrderedMutation.isPending} onClick={() => markOrderedMutation.mutate(po.id)}>
                            Mark Ordered
                          </button>
                        )}
                        {po.status === "ORDERED" && (
                          <button className="ad-btn ad-btn-primary" onClick={() => setReceivingPo(po)}>Receive Stock</button>
                        )}
                        {(po.status === "DRAFT" || po.status === "ORDERED") && (
                          <button className="ad-btn ad-btn-danger" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(po.id)}>Cancel</button>
                        )}
                      </PermissionGate>
                    </div>
                  </div>
                  <table className="ad-table" style={{ marginTop: 10 }}>
                    <thead><tr><th>Item</th><th>Ordered</th><th>Received</th></tr></thead>
                    <tbody>
                      {po.items.map((i) => (
                        <tr key={i.id}>
                          <td>{i.stockItem.name} <span style={{ color: "var(--color-text-muted)" }}>({i.stockItem.sku})</span></td>
                          <td>{i.quantityOrdered} {i.stockItem.unit}</td>
                          <td>{i.quantityReceived} {i.stockItem.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">No purchase orders yet.</div>
        )}
      </div>

      {showSupplierForm && <SupplierFormModal onClose={() => setShowSupplierForm(false)} />}
      {showPoForm && suppliers && <PurchaseOrderFormModal suppliers={suppliers} onClose={() => setShowPoForm(false)} />}
      {receivingPo && <ReceiveStockModal po={receivingPo} onClose={() => setReceivingPo(null)} />}
    </div>
  );
}

function SupplierFormModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/procurement/suppliers", { name, contactName: contactName || undefined, email: email || undefined, phone: phone || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["suppliers"] }); onClose(); },
  });

  return (
    <FormModal title="Add Supplier" onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()} submitLabel="Add Supplier">
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Contact Name</label><input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
      <div className="grid grid-cols-2">
        <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
    </FormModal>
  );
}

function PurchaseOrderFormModal({ suppliers, onClose }: { suppliers: Supplier[]; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState(String(suppliers[0]?.id ?? ""));
  const [expectedAt, setExpectedAt] = useState("");
  const [lines, setLines] = useState<{ stockItemId: string; quantityOrdered: number; unitCost: string }[]>([{ stockItemId: "", quantityOrdered: 1, unitCost: "" }]);
  const queryClient = useQueryClient();

  const { data: stockItems } = useQuery({
    queryKey: ["stock-items-for-po"],
    queryFn: async () => (await axiosClient.get("/stock", { params: { pageSize: 200 } })).data.items,
  });

  const mutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/procurement/purchase-orders", {
        supplierId: Number(supplierId),
        expectedAt: expectedAt ? new Date(expectedAt).toISOString() : null,
        items: lines
          .filter((l) => l.stockItemId)
          .map((l) => ({ stockItemId: Number(l.stockItemId), quantityOrdered: l.quantityOrdered, unitCost: l.unitCost ? Number(l.unitCost) : null })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onClose();
    },
  });

  function updateLine(idx: number, patch: Partial<{ stockItemId: string; quantityOrdered: number; unitCost: string }>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const validLines = lines.filter((l) => l.stockItemId && l.quantityOrdered > 0);

  return (
    <FormModal title="New Purchase Order" onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!supplierId || validLines.length === 0} submitLabel="Create PO" maxWidth={640}>
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Supplier</label>
          <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Expected Date</label><input className="input" type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Line Items</label>
        <div className="stack gap-2">
          {lines.map((line, idx) => (
            <div key={idx} className="row gap-2">
              <select className="select" style={{ flex: 2 }} value={line.stockItemId} onChange={(e) => updateLine(idx, { stockItemId: e.target.value })}>
                <option value="">Select stock item...</option>
                {stockItems?.map((si: any) => <option key={si.id} value={si.id}>{si.name} ({si.sku})</option>)}
              </select>
              <input className="input" style={{ flex: 1 }} type="number" min={1} placeholder="Qty" value={line.quantityOrdered} onChange={(e) => updateLine(idx, { quantityOrdered: Number(e.target.value) })} />
              <input className="input" style={{ flex: 1 }} type="number" min={0} step="0.01" placeholder="Unit cost" value={line.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} disabled={lines.length === 1}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, { stockItemId: "", quantityOrdered: 1, unitCost: "" }])}>
          <Icon name="plus" size={12} /> Add Line
        </button>
      </div>
    </FormModal>
  );
}

function ReceiveStockModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const [locationId, setLocationId] = useState("");
  const outstanding = po.items.filter((i) => i.quantityReceived < i.quantityOrdered);
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(outstanding.map((i) => [i.id, i.quantityOrdered - i.quantityReceived]))
  );
  const queryClient = useQueryClient();
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });

  const mutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/procurement/purchase-orders/${po.id}/receive`, {
        locationId: Number(locationId),
        lines: outstanding.filter((i) => quantities[i.id] > 0).map((i) => ({ purchaseOrderItemId: i.id, quantityReceived: quantities[i.id] })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      onClose();
    },
  });

  return (
    <FormModal title={`Receive Stock — ${po.poNumber}`} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!locationId} submitLabel="Confirm Receipt">
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="field">
        <label>Receiving Location</label>
        <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Select location...</option>
          {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Quantities to Receive</label>
        <table className="ad-table">
          <thead><tr><th>Item</th><th>Outstanding</th><th>Receive Now</th></tr></thead>
          <tbody>
            {outstanding.map((i) => (
              <tr key={i.id}>
                <td>{i.stockItem.name}</td>
                <td>{i.quantityOrdered - i.quantityReceived} {i.stockItem.unit}</td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={i.quantityOrdered - i.quantityReceived}
                    value={quantities[i.id] ?? 0}
                    onChange={(e) => setQuantities((q) => ({ ...q, [i.id]: Number(e.target.value) }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormModal>
  );
}
