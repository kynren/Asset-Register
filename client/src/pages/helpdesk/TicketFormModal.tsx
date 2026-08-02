import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";

export interface TicketFormValues {
  title: string;
  description: string;
  type: string;
  priority: string;
  categoryId: number | null;
  assetId: number | null;
  locationId: number | null;
  assigneeId: number | null;
  assignedTeamId: number | null;
  dueAt?: string;
}

const TYPES = ["ACTION", "INFORMATION"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function TicketFormModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: TicketFormValues) => void; submitting?: boolean }) {
  const [values, setValues] = useState<Omit<TicketFormValues, "dueAt">>({
    title: "",
    description: "",
    type: "ACTION",
    priority: "MEDIUM",
    categoryId: null,
    assetId: null,
    locationId: null,
    assigneeId: null,
    assignedTeamId: null,
  });
  const [dueAtLocal, setDueAtLocal] = useState("");

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
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await axiosClient.get("/locations")).data,
  });
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await axiosClient.get("/teams")).data,
  });

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit() {
    onSubmit({ ...values, dueAt: dueAtLocal ? new Date(dueAtLocal).toISOString() : undefined });
  }

  return (
    <FormModal title="New Ticket" onClose={onClose} onSubmit={handleSubmit} submitting={submitting} maxWidth={560}>
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
          <label>Type</label>
          <select className="select" value={values.type} onChange={(e) => update("type", e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t === "ACTION" ? "Action" : "Information"}</option>)}
          </select>
        </div>
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
          <label>Location</label>
          <select className="select" value={values.locationId ?? ""} onChange={(e) => update("locationId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Assign To</label>
          <select className="select" value={values.assigneeId ?? ""} onChange={(e) => update("assigneeId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Unassigned</option>
            {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Assign to Team</label>
          <select className="select" value={values.assignedTeamId ?? ""} onChange={(e) => update("assignedTeamId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">No team</option>
            {teams?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Due Date <span className="muted">(optional)</span></label>
          <input className="input" type="datetime-local" value={dueAtLocal} onChange={(e) => setDueAtLocal(e.target.value)} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Leave the due date blank to auto-calculate it from the priority's SLA.</p>
    </FormModal>
  );
}
