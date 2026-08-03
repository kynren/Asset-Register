import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";
import { PermissionGate } from "../../../auth/PermissionGate";

export function AssetFinancialTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const [values, setValues] = useState({
    supplier: asset.supplier ?? "",
    invoiceNumber: asset.invoiceNumber ?? "",
    purchaseDate: asset.purchaseDate?.slice(0, 10) ?? "",
    purchaseCost: asset.purchaseCost ?? "",
    warrantyExpiresAt: asset.warrantyExpiresAt?.slice(0, 10) ?? "",
    nextServiceDate: asset.nextServiceDate?.slice(0, 10) ?? "",
  });

  useEffect(() => {
    setValues({
      supplier: asset.supplier ?? "",
      invoiceNumber: asset.invoiceNumber ?? "",
      purchaseDate: asset.purchaseDate?.slice(0, 10) ?? "",
      purchaseCost: asset.purchaseCost ?? "",
      warrantyExpiresAt: asset.warrantyExpiresAt?.slice(0, 10) ?? "",
      nextServiceDate: asset.nextServiceDate?.slice(0, 10) ?? "",
    });
  }, [asset.id, asset.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${asset.id}`, {
        supplier: values.supplier || null,
        invoiceNumber: values.invoiceNumber || null,
        purchaseDate: values.purchaseDate ? new Date(values.purchaseDate).toISOString() : null,
        purchaseCost: values.purchaseCost === "" ? null : Number(values.purchaseCost),
        warrantyExpiresAt: values.warrantyExpiresAt ? new Date(values.warrantyExpiresAt).toISOString() : null,
        nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
      }),
    onSuccess: onUpdated,
  });

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="creditCard" size={16} /> Financial &amp; Administrative Info</h2>
        <p className="ad-content-subtitle">Purchase, supplier, invoice, warranty, and service scheduling for this asset.</p>
      </div>

      <div className="ad-panel" style={{ maxWidth: 640 }}>
        <div className="ad-add-form" style={{ marginBottom: 0 }}>
          <div className="ad-field">
            <label>Supplier</label>
            <input className="ad-input" value={values.supplier} onChange={(e) => setValues((v) => ({ ...v, supplier: e.target.value }))} placeholder="e.g. Dell Technologies" />
          </div>
          <div className="ad-field">
            <label>Invoice Number</label>
            <input className="ad-input" value={values.invoiceNumber} onChange={(e) => setValues((v) => ({ ...v, invoiceNumber: e.target.value }))} placeholder="e.g. INV-2026-00142" />
          </div>
          <div className="ad-field">
            <label>Purchase Date</label>
            <input className="ad-input" type="date" value={values.purchaseDate} onChange={(e) => setValues((v) => ({ ...v, purchaseDate: e.target.value }))} />
          </div>
          <div className="ad-field">
            <label>Purchase Cost</label>
            <input className="ad-input" type="number" value={values.purchaseCost} onChange={(e) => setValues((v) => ({ ...v, purchaseCost: e.target.value }))} />
          </div>
          <div className="ad-field">
            <label>Warranty Expires</label>
            <input className="ad-input" type="date" value={values.warrantyExpiresAt} onChange={(e) => setValues((v) => ({ ...v, warrantyExpiresAt: e.target.value }))} />
          </div>
          <div className="ad-field">
            <label>Next Service Date</label>
            <input className="ad-input" type="date" value={values.nextServiceDate} onChange={(e) => setValues((v) => ({ ...v, nextServiceDate: e.target.value }))} />
          </div>
        </div>
        <PermissionGate module="assets" action="edit">
          <button className="ad-btn ad-btn-primary" style={{ marginTop: 12 }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </PermissionGate>
      </div>
    </div>
  );
}
