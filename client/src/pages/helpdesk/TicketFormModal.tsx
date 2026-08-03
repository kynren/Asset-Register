import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";

export interface TicketFormValues {
  title: string;
  description: string;
  type: string;
  priority: string;
  categoryId: number | null;
  assetId: number | null;
  locationId: number | null;
  assigneeIds: number[];
  assignedTeamIds: number[];
  dueAt?: string;
}

const TYPES = ["ACTION", "INFORMATION"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function toggle(set: Set<number>, setSet: (s: Set<number>) => void, id: number) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSet(next);
}

export function TicketFormModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: TicketFormValues) => void; submitting?: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ACTION");
  const [priority, setPriority] = useState("MEDIUM");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(new Set());
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<number>>(new Set());
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

  function handleSubmit() {
    onSubmit({
      title,
      description,
      type,
      priority,
      categoryId,
      assetId,
      locationId,
      assigneeIds: [...assigneeIds],
      assignedTeamIds: [...assignedTeamIds],
      dueAt: dueAtLocal ? new Date(dueAtLocal).toISOString() : undefined,
    });
  }

  return (
    <FormModal title="New Ticket" onClose={onClose} onSubmit={handleSubmit} submitting={submitting} maxWidth={560}>
      <div className="field">
        <label>Title *</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="field">
        <label>Description *</label>
        <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t === "ACTION" ? "Action" : "Information"}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Priority</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <QuickAddSelect
          label="Category"
          value={categoryId}
          onChange={setCategoryId}
          options={categories}
          createUrl="/ticket-categories"
          queryKey="ticket-categories"
        />
        <div className="field">
          <label>Related Asset</label>
          <select className="select" value={assetId ?? ""} onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {assets?.map((a: any) => <option key={a.id} value={a.id}>{a.assetTag} — {a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <select className="select" value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Due Date <span className="muted">(optional)</span></label>
          <input className="input" type="datetime-local" value={dueAtLocal} onChange={(e) => setDueAtLocal(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="field">
          <label>Assign To ({assigneeIds.size} selected)</label>
          <div className="stack gap-1" style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
            {users?.map((u: any) => (
              <label key={u.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={assigneeIds.has(u.id)} onChange={() => toggle(assigneeIds, setAssigneeIds, u.id)} />
                {u.firstName} {u.lastName}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Assign to Team(s) ({assignedTeamIds.size} selected)</label>
          <div className="stack gap-1" style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
            {teams?.length ? teams.map((t: any) => (
              <label key={t.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={assignedTeamIds.has(t.id)} onChange={() => toggle(assignedTeamIds, setAssignedTeamIds, t.id)} />
                {t.name}
              </label>
            )) : <span className="muted" style={{ fontSize: 12 }}>No teams yet.</span>}
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Leave the due date blank to auto-calculate it from the priority's SLA.</p>
    </FormModal>
  );
}
