import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";

const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];

export function ManagementTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const [values, setValues] = useState({
    status: asset.status,
    signOffStatus: asset.signOffStatus,
    purchaseDate: asset.purchaseDate?.slice(0, 10) ?? "",
    purchaseCost: asset.purchaseCost ?? "",
    warrantyExpiresAt: asset.warrantyExpiresAt?.slice(0, 10) ?? "",
    nextServiceDate: asset.nextServiceDate?.slice(0, 10) ?? "",
    notes: asset.notes ?? "",
  });

  useEffect(() => {
    setValues({
      status: asset.status,
      signOffStatus: asset.signOffStatus,
      purchaseDate: asset.purchaseDate?.slice(0, 10) ?? "",
      purchaseCost: asset.purchaseCost ?? "",
      warrantyExpiresAt: asset.warrantyExpiresAt?.slice(0, 10) ?? "",
      nextServiceDate: asset.nextServiceDate?.slice(0, 10) ?? "",
      notes: asset.notes ?? "",
    });
  }, [asset.id, asset.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${asset.id}`, {
        status: values.status,
        signOffStatus: values.signOffStatus,
        purchaseDate: values.purchaseDate ? new Date(values.purchaseDate).toISOString() : null,
        purchaseCost: values.purchaseCost === "" ? null : Number(values.purchaseCost),
        warrantyExpiresAt: values.warrantyExpiresAt ? new Date(values.warrantyExpiresAt).toISOString() : null,
        nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
        notes: values.notes,
      }),
    onSuccess: onUpdated,
  });

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="briefcase" size={16} /> Management</h2>
        <p className="ad-content-subtitle">Lifecycle status, purchase, warranty, and service scheduling for this asset.</p>
      </div>

      <div className="ad-panel" style={{ maxWidth: 640 }}>
        <div className="ad-add-form" style={{ marginBottom: 0 }}>
          <div className="ad-field">
            <label>Status</label>
            <select className="ad-select" value={values.status} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="ad-field">
            <label>Sign-off Status</label>
            <select className="ad-select" value={values.signOffStatus} onChange={(e) => setValues((v) => ({ ...v, signOffStatus: e.target.value }))}>
              <option value="PENDING">PENDING</option>
              <option value="CONFIRMED">CONFIRMED</option>
            </select>
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
        <div className="ad-field" style={{ marginTop: 10 }}>
          <label>Notes</label>
          <textarea className="ad-input" rows={3} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
        </div>
        <button className="ad-btn ad-btn-primary" style={{ marginTop: 12 }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
