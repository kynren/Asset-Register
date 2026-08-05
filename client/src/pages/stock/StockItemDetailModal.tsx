import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { SignaturePad } from "../../components/SignaturePad";
import { Icon } from "../../components/Icon";
import { StockAttachmentsField } from "./StockAttachmentsField";
import { CommentThread } from "../../components/CommentThread";

interface StockLevel {
  id: number;
  locationId: number;
  quantityOnHand: number;
  location: { id: number; name: string };
}

interface StockTransaction {
  id: number;
  type: "IN" | "OUT" | "TRANSFER";
  quantity: number;
  reason: string | null;
  createdAt: string;
  performedBy: { firstName: string; lastName: string };
  issuance: { id: number; receivedBy: { firstName: string; lastName: string } } | null;
}

interface StockItemDetail {
  id: number;
  sku: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  stockItemType: { name: string } | null;
  stockLevels: StockLevel[];
  transactions: StockTransaction[];
}

// Opened after a successful QR scan (or from the Register table) — shows current quantity,
// per-location breakdown, and stock/issuance history, plus an inline "Issue Stock" flow: pick a
// location + quantity + recipient, capture their drawn signature, submit. An over-quantity request
// is blocked with an on-screen banner before submit rather than a toast, per spec.
export function StockItemDetailModal({ stockItemId, onClose }: { stockItemId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showIssue, setShowIssue] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [receivedById, setReceivedById] = useState("");
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [receiptIssuanceId, setReceiptIssuanceId] = useState<number | null>(null);

  const { data: item } = useQuery<StockItemDetail>({
    queryKey: ["stock-item-detail", stockItemId],
    queryFn: async () => (await axiosClient.get(`/stock/${stockItemId}`)).data,
  });
  const { data: users } = useQuery({
    queryKey: ["users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data as { id: number; firstName: string; lastName: string }[],
  });

  const levels = item?.stockLevels ?? [];
  const selectedLevel = levels.find((l) => String(l.locationId) === locationId);
  const available = selectedLevel?.quantityOnHand ?? 0;
  const overQuantity = !!locationId && quantity > available;

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Item not loaded");
      if (!signatureBlob) throw new Error("Signature is required");
      const form = new FormData();
      form.append("scannedSku", item.sku);
      form.append("quantity", String(quantity));
      form.append("receivedById", receivedById);
      form.append("locationId", locationId);
      form.append("signature", signatureBlob, "signature.png");
      return axiosClient.post(`/stock/${item.id}/issue`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    meta: { successMessage: "Stock issued" },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-item-detail", stockItemId] });
      setReceiptIssuanceId(res.data?.issuance?.id ?? null);
      setShowIssue(false);
      setLocationId("");
      setQuantity(1);
      setReceivedById("");
      setSignatureBlob(null);
    },
  });

  const canSubmitIssue = !!locationId && !!receivedById && quantity > 0 && !overQuantity && !!signatureBlob;

  async function downloadReceipt() {
    if (!receiptIssuanceId) return;
    const res = await axiosClient.get(`/stock/issuances/${receiptIssuanceId}/receipt.pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-issuance-${receiptIssuanceId}-receipt.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  if (!item) {
    return (
      <FormModal title="Stock Item" onClose={onClose} hideFooter>
        <p className="muted">Loading...</p>
      </FormModal>
    );
  }

  return (
    <FormModal title={item.name} onClose={onClose} hideFooter maxWidth={620}>
      <div className="stack gap-3">
        <div className="row gap-2" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{item.sku} {item.stockItemType ? `· ${item.stockItemType.name}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: item.quantityOnHand <= item.reorderLevel ? "var(--color-danger)" : undefined }}>
              {item.quantityOnHand} {item.unit}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>on hand across all locations</div>
          </div>
        </div>

        {receiptIssuanceId && (
          <div className="alert alert-success row gap-2" style={{ justifyContent: "space-between" }}>
            <span>Stock issued successfully.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadReceipt}>
              <Icon name="download" size={12} /> Download Receipt
            </button>
          </div>
        )}

        <div className="field">
          <label>By Location</label>
          {levels.length > 0 ? (
            <table className="ad-table">
              <thead><tr><th>Location</th><th>On Hand</th></tr></thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l.id}><td>{l.location.name}</td><td>{l.quantityOnHand} {item.unit}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No stock recorded at any location yet.</p>
          )}
        </div>

        {!showIssue ? (
          <button className="btn btn-primary" onClick={() => setShowIssue(true)}><Icon name="arrowRight" size={13} /> Issue Stock</button>
        ) : (
          <div className="card" style={{ background: "var(--color-bg)" }}>
            <h4 className="mt-0">Issue Stock</h4>
            {overQuantity && (
              <div className="alert alert-danger">
                Not enough stock at this location: {available} {item.unit} on hand, {quantity} requested. Reduce the quantity or choose a different location.
              </div>
            )}
            <div className="grid grid-cols-2">
              <div className="field">
                <label>Location</label>
                <ChipSelect
                  value={locationId}
                  onChange={setLocationId}
                  placeholder="Select location..."
                  options={[{ value: "", label: "Select location..." }, ...levels.map((l) => ({ value: String(l.locationId), label: `${l.location.name} (${l.quantityOnHand} ${item.unit})` }))]}
                />
              </div>
              <div className="field">
                <label>Quantity</label>
                <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </div>
            </div>
            <div className="field">
              <label>Receiving User</label>
              <ChipSelect
                value={receivedById}
                onChange={setReceivedById}
                placeholder="Select user..."
                options={[{ value: "", label: "Select user..." }, ...(users ?? []).map((u) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))]}
              />
            </div>
            <div className="field">
              <label>Recipient Signature</label>
              <SignaturePad onChange={setSignatureBlob} />
            </div>
            {issueMutation.isError && (
              <div className="alert alert-danger">{(issueMutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>
            )}
            <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn btn-secondary" onClick={() => setShowIssue(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!canSubmitIssue || issueMutation.isPending} onClick={() => issueMutation.mutate()}>
                {issueMutation.isPending ? "Issuing..." : "Confirm Issue"}
              </button>
            </div>
          </div>
        )}

        <StockAttachmentsField stockItemId={item.id} />

        <div className="field">
          <label>History</label>
          {item.transactions.length === 0 ? (
            <p className="muted">No transactions yet.</p>
          ) : (
            <table className="ad-table">
              <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>By</th><th>Issued To</th></tr></thead>
              <tbody>
                {item.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>{t.type}</td>
                    <td>{t.quantity}</td>
                    <td>{t.performedBy.firstName} {t.performedBy.lastName}</td>
                    <td>{t.issuance ? `${t.issuance.receivedBy.firstName} ${t.issuance.receivedBy.lastName}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <CommentThread entityType="StockItem" entityId={item.id} />
      </div>
    </FormModal>
  );
}
