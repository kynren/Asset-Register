import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";
import { ChipSelect } from "../../components/ChipSelect";

export interface TicketFormValues {
  title: string;
  description: string;
  type: string;
  itilType: string;
  templateId: number | null;
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
const ITIL_TYPES = ["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];

interface TemplateField {
  fieldKey: string;
  mode: "HIDDEN" | "MANDATORY" | "READONLY" | "PREDEFINED";
  predefinedValue: string | null;
}

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
  const [itilType, setItilType] = useState("INCIDENT");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [priority, setPriority] = useState("MEDIUM");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(new Set());
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<number>>(new Set());
  const [dueAtLocal, setDueAtLocal] = useState("");

  const { data: templates } = useQuery({
    queryKey: ["ticket-templates"],
    queryFn: async () => (await axiosClient.get("/ticket-templates")).data,
  });
  const { data: selectedTemplate } = useQuery({
    queryKey: ["ticket-template", templateId],
    queryFn: async () => (await axiosClient.get(`/ticket-templates/${templateId}`)).data,
    enabled: templateId != null,
  });

  const fieldRules: Record<string, TemplateField> = {};
  for (const f of (selectedTemplate?.fields ?? []) as TemplateField[]) fieldRules[f.fieldKey] = f;

  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedTemplate.itilType) setItilType(selectedTemplate.itilType);
    for (const f of selectedTemplate.fields as TemplateField[]) {
      if (f.mode !== "PREDEFINED" || f.predefinedValue == null) continue;
      switch (f.fieldKey) {
        case "title": setTitle(f.predefinedValue); break;
        case "description": setDescription(f.predefinedValue); break;
        case "priority": setPriority(f.predefinedValue); break;
        case "categoryId": setCategoryId(Number(f.predefinedValue)); break;
        case "assetId": setAssetId(Number(f.predefinedValue)); break;
        case "locationId": setLocationId(Number(f.predefinedValue)); break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  function isHidden(key: string) {
    return fieldRules[key]?.mode === "HIDDEN";
  }
  function isReadonly(key: string) {
    return fieldRules[key]?.mode === "READONLY" || fieldRules[key]?.mode === "PREDEFINED";
  }
  function isMandatory(key: string) {
    return fieldRules[key]?.mode === "MANDATORY";
  }

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
      itilType,
      templateId,
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
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Template <span className="muted">(optional)</span></label>
          <ChipSelect
            value={templateId != null ? String(templateId) : ""}
            onChange={(v) => setTemplateId(v ? Number(v) : null)}
            placeholder="No template"
            options={[
              { value: "", label: "No template" },
              ...(templates?.map((t: any) => ({ value: String(t.id), label: t.name })) ?? []),
            ]}
          />
        </div>
        <div className="field">
          <label>ITIL Type</label>
          <ChipSelect
            value={itilType}
            onChange={setItilType}
            options={ITIL_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
      </div>

      {!isHidden("title") && (
        <div className="field">
          <label>Title {isMandatory("title") ? "*" : ""}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isReadonly("title")} />
        </div>
      )}
      {!isHidden("description") && (
        <div className="field">
          <label>Description {isMandatory("description") ? "*" : ""}</label>
          <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isReadonly("description")} />
        </div>
      )}
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Type</label>
          <ChipSelect
            value={type}
            onChange={setType}
            options={TYPES.map((t) => ({ value: t, label: t === "ACTION" ? "Action" : "Information" }))}
          />
        </div>
        {!isHidden("priority") && (
          <div className="field">
            <label>Priority {isMandatory("priority") ? "*" : ""}</label>
            <ChipSelect
              value={priority}
              onChange={setPriority}
              disabled={isReadonly("priority")}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            />
          </div>
        )}
        {!isHidden("categoryId") && (
          <QuickAddSelect
            label={`Category${isMandatory("categoryId") ? " *" : ""}`}
            value={categoryId}
            onChange={isReadonly("categoryId") ? () => {} : setCategoryId}
            options={categories}
            createUrl="/ticket-categories"
            queryKey="ticket-categories"
          />
        )}
        {!isHidden("assetId") && (
          <div className="field">
            <label>Related Asset {isMandatory("assetId") ? "*" : ""}</label>
            <ChipSelect
              value={assetId != null ? String(assetId) : ""}
              onChange={(v) => setAssetId(v ? Number(v) : null)}
              disabled={isReadonly("assetId")}
              placeholder="—"
              options={[
                { value: "", label: "—" },
                ...(assets?.map((a: any) => ({ value: String(a.id), label: `${a.assetTag} — ${a.name}` })) ?? []),
              ]}
            />
          </div>
        )}
        {!isHidden("locationId") && (
          <div className="field">
            <label>Location {isMandatory("locationId") ? "*" : ""}</label>
            <ChipSelect
              value={locationId != null ? String(locationId) : ""}
              onChange={(v) => setLocationId(v ? Number(v) : null)}
              disabled={isReadonly("locationId")}
              placeholder="—"
              options={[
                { value: "", label: "—" },
                ...(locations?.map((l: any) => ({ value: String(l.id), label: l.name })) ?? []),
              ]}
            />
          </div>
        )}
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
