import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";

export interface AssetFormValues {
  assetTag: string;
  name: string;
  status: string;
  categoryId: number | null;
  locationId: number | null;
  assignedToId: number | null;
  manufacturer: string;
  model: string;
  serialNumber: string;
  notes: string;
  nextServiceDate: string;
}

const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];

const emptyValues: AssetFormValues = {
  assetTag: "",
  name: "",
  status: "IN_USE",
  categoryId: null,
  locationId: null,
  assignedToId: null,
  manufacturer: "",
  model: "",
  serialNumber: "",
  notes: "",
  nextServiceDate: "",
};

export function AssetFormModal({
  initial,
  title,
  onClose,
  onSubmit,
  submitting,
}: {
  initial?: Partial<AssetFormValues>;
  title?: string;
  onClose: () => void;
  onSubmit: (values: AssetFormValues) => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<AssetFormValues>({ ...emptyValues, ...initial });

  useEffect(() => {
    setValues({ ...emptyValues, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const { data: categories } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data,
  });
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await axiosClient.get("/locations")).data,
  });
  const { data: users } = useQuery({
    queryKey: ["users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data,
  });

  function update<K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <FormModal
      title={title ?? (initial ? "Edit Asset" : "Add Asset")}
      onClose={onClose}
      onSubmit={() => onSubmit(values)}
      submitting={submitting}
      maxWidth={620}
    >
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Asset Tag *</label>
          <input className="input" value={values.assetTag} onChange={(e) => update("assetTag", e.target.value)} required />
        </div>
        <div className="field">
          <label>Name *</label>
          <input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={values.status} onChange={(e) => update("status", e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <select className="select" value={values.categoryId ?? ""} onChange={(e) => update("categoryId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <select className="select" value={values.locationId ?? ""} onChange={(e) => update("locationId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Assigned To</label>
          <select className="select" value={values.assignedToId ?? ""} onChange={(e) => update("assignedToId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Unassigned</option>
            {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Manufacturer</label>
          <input className="input" value={values.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
        </div>
        <div className="field">
          <label>Model</label>
          <input className="input" value={values.model} onChange={(e) => update("model", e.target.value)} />
        </div>
        <div className="field">
          <label>Serial Number</label>
          <input className="input" value={values.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} />
        </div>
        <div className="field">
          <label>Next Service Date</label>
          <input className="input" type="date" value={values.nextServiceDate} onChange={(e) => update("nextServiceDate", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea className="input" rows={3} value={values.notes} onChange={(e) => update("notes", e.target.value)} />
      </div>
    </FormModal>
  );
}
