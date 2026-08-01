import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { MODULES, ModuleName } from "../../lib/permissions";
import { Skeleton } from "../../components/Skeleton";

interface RolePermission {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}
interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: RolePermission[];
}

type PermAction = "canView" | "canCreate" | "canEdit" | "canDelete" | "canExport";
const ACTIONS: PermAction[] = ["canView", "canCreate", "canEdit", "canDelete", "canExport"];
const ACTION_LABELS: Record<string, string> = { canView: "View", canCreate: "Create", canEdit: "Edit", canDelete: "Delete", canExport: "Export" };

// Every feature area gated behind each module, kept in sync as new functionality lands —
// several modules cover more than their name implies since newer features (Licenses,
// Suppliers & POs, PTZ/Recording/Motion Detection, Form Templates) were added under an
// existing module rather than a brand-new one.
const MODULE_INFO: Record<ModuleName, { label: string; description: string }> = {
  dashboard: { label: "Dashboard", description: "KPI widgets, charts, and recent activity feed." },
  assets: { label: "Asset Inventory", description: "Asset CRUD, check-in/check-out, CSV/QR import-export, asset detail (Profile, Reports, Logs, sub-resources)." },
  network: { label: "Network Topology Map", description: "Topology graph, ICMP ping console, IP range scanner, agent-reported client devices." },
  stock: { label: "Stock Register & Analytics", description: "Stock items, multi-location stock levels & transfers, analytics — and Suppliers & Purchase Orders." },
  helpdesk: { label: "Helpdesk & Ticketing", description: "Ticket CRUD, comments, status workflow." },
  operations: { label: "Operations Tools", description: "IT Projects Kanban, Knowledge Base, Asset Bookings, Saved Queries, Resource Scheduling, Bulk & Reports — and Software Licenses." },
  nvr: { label: "NVRs & Cameras", description: "Device management, live view, event log, ONVIF PTZ control, recording & retention, motion detection alerts." },
  "access-control": { label: "Access Control", description: "Doors, credentials, Person/Organization directory, Access Groups." },
  lighting: { label: "Lighting", description: "Devices, Rooms dashboard, Scenes, Automations, ZigBee scaffold." },
  "virtual-assistant": { label: "Virtual Assistant", description: "In-app assistant chat and quick actions." },
  docs: { label: "Docs & SOPs", description: "Manuals, SOPs, runbooks, and other documents — collections, full-text search, attachments." },
  admin: { label: "Admin & Setup", description: "Users, Roles & Permissions, Categories & Locations, Asset Form Templates, System Settings, Audit Log." },
  password: { label: "Password Management", description: "Each user's personal password vault." },
};

export function RolesTab() {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data: roles, isLoading } = useQuery({ queryKey: ["roles"], queryFn: async () => (await axiosClient.get("/roles")).data as Role[] });
  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? roles?.[0];

  const [draft, setDraft] = useState<RolePermission[] | null>(null);
  const activePermissions = draft ?? selectedRole?.permissions ?? [];

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put(`/roles/${selectedRole!.id}/permissions`, { permissions: buildFullMatrix(activePermissions) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["roles"] }); setDraft(null); },
  });

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description: string }) => axiosClient.post("/roles", values),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ["roles"] }); setShowCreate(false); setSelectedRoleId(res.data.id); },
  });

  function buildFullMatrix(perms: RolePermission[]): RolePermission[] {
    return MODULES.map((m) => perms.find((p) => p.module === m) ?? { module: m, canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false });
  }

  function toggle(module: ModuleName, action: PermAction) {
    const full = buildFullMatrix(activePermissions);
    const updated = full.map((p) => (p.module === module ? { ...p, [action]: !p[action] } : p));
    setDraft(updated);
  }

  if (isLoading || !roles) {
    return (
      <div className="grid" style={{ gridTemplateColumns: "220px 1fr", gap: 16 }}>
        <Skeleton height={280} />
        <Skeleton height={280} />
      </div>
    );
  }

  const matrix = buildFullMatrix(activePermissions);

  return (
    <div className="grid" style={{ gridTemplateColumns: "220px 1fr", gap: 16 }}>
      <div className="card" style={{ padding: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "4px 6px 10px" }}>
          <strong style={{ fontSize: 13 }}>Roles</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(true)}>+ New</button>
        </div>
        {roles.map((r) => (
          <div
            key={r.id}
            onClick={() => { setSelectedRoleId(r.id); setDraft(null); }}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              background: (selectedRole?.id === r.id) ? "var(--color-primary-soft)" : "transparent",
              color: (selectedRole?.id === r.id) ? "var(--color-primary)" : "inherit",
              fontWeight: (selectedRole?.id === r.id) ? 600 : 400,
            }}
          >
            {r.name} <span className="muted" style={{ fontWeight: 400 }}>{r.isSystem ? "" : "(custom)"}</span>
          </div>
        ))}
      </div>

      {selectedRole && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h3 className="mt-0 mb-0">{selectedRole.name}</h3>
              <p className="muted" style={{ margin: "2px 0 0" }}>{selectedRole.description}</p>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!draft || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save Permissions"}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  {ACTIONS.map((a) => <th key={a} style={{ textAlign: "center" }}>{ACTION_LABELS[a]}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((module) => {
                  const perm = matrix.find((p) => p.module === module)!;
                  const info = MODULE_INFO[module];
                  return (
                    <tr key={module}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{info.label}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2, maxWidth: 360 }}>{info.description}</div>
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a} style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={perm[a]} onChange={() => toggle(module, a)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && <CreateRoleModal onClose={() => setShowCreate(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />}
    </div>
  );
}

function CreateRoleModal({ onClose, onSubmit, submitting }: { onClose: () => void; onSubmit: (v: { name: string; description: string }) => void; submitting?: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <FormModal title="New Role" onClose={onClose} onSubmit={() => onSubmit({ name, description })} submitting={submitting}>
      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="field"><label>Description</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
    </FormModal>
  );
}
