import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";

export interface TicketFormValues {
  title: string;
  description: string;
  priority: string;
  categoryId: number | null;
  assetId: number | null;
  assigneeId: number | null;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function TicketFormModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: TicketFormValues) => void; submitting?: boolean }) {
  const [values, setValues] = useState<TicketFormValues>({ title: "", description: "", priority: "MEDIUM", categoryId: null, assetId: null, assigneeId: null });

  const { data: assets } = useQuery({
    queryKey: ["assets-lite"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 100 } })).data.items,
  });
  const { data: users } = useQuery({
    queryKey: ["users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data,
  });
  const { data: categories } = useQuery({
    queryKey: ["ticket-categories"],
    queryFn: async () => (await axiosClient.get("/ticket-categories")).data,
  });

  function update<K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <FormModal title="New Ticket" onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} maxWidth={560}>
      <div className="field">
        <label>Title *</label>
        <input className="input" value={values.title} onChange={(e) => update("title", e.target.value)} required />
      </div>
      <div className="field">
        <label>Description *</label>
        <textarea className="input" rows={4} value={values.description} onChange={(e) => update("description", e.target.value)} required />
      </div>
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Priority</label>
          <select className="select" value={values.priority} onChange={(e) => update("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
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
          <label>Related Asset</label>
          <select className="select" value={values.assetId ?? ""} onChange={(e) => update("assetId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {assets?.map((a: any) => <option key={a.id} value={a.id}>{a.assetTag} — {a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Assign To</label>
          <select className="select" value={values.assigneeId ?? ""} onChange={(e) => update("assigneeId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Unassigned</option>
            {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
      </div>
    </FormModal>
  );
}
