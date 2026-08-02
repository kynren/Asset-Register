import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { MODULES, ModuleName } from "../../lib/permissions";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../components/toast/ToastProvider";
import { PublishOrScheduleModal } from "../appSettings/PublishOrScheduleModal";
import { ScheduledChangeRow } from "../appSettings/scheduledChangeTypes";

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
  harness: { label: "Harness Register", description: "Fall-arrest harness compliance register — separate from general Asset Inventory access." },
  "operational-context": { label: "Operational Context", description: "Live show-status dashboard — Active Show Assets reachability gauge and client battery state." },
  network: { label: "Network Topology Map", description: "Topology graph, ICMP ping console, IP range scanner, agent-reported client devices." },
  stock: { label: "Stock Register & Analytics", description: "Stock items, multi-location stock levels & transfers, analytics — and Suppliers & Purchase Orders." },
  helpdesk: { label: "Helpdesk & Ticketing", description: "Ticket CRUD, comments, status workflow." },
  operations: { label: "Operations Tools", description: "IT Projects Kanban, Knowledge Base, Asset Bookings, Saved Queries, Resource Scheduling, Bulk & Reports — and Software Licenses." },
  nvr: { label: "NVRs & Cameras", description: "Device management, live view, event log, ONVIF PTZ control, recording & retention, motion detection alerts." },
  "access-control": { label: "Access Control", description: "Doors, credentials, Person/Organization directory, Access Groups." },
  lighting: { label: "Lighting", description: "Devices, Rooms dashboard, Scenes, Automations, ZigBee scaffold." },
  "virtual-assistant": { label: "Virtual Assistant", description: "In-app assistant chat and quick actions." },
  docs: { label: "Docs & SOPs", description: "Manuals, SOPs, runbooks, and other documents — collections, full-text search, attachments." },
  admin: { label: "Admin & Setup", description: "Users, Roles & Permissions, Categories & Locations, Asset Form Templates, Email Templates, Audit Log." },
  password: { label: "Password Management", description: "Each user's personal password vault." },
  "app-settings": { label: "App Settings", description: "Organizations (create new orgs), Backups, System Settings, System Status — platform-level, System Admin only." },
};

export function RolesTab({
  enableScheduling,
  editingScheduledChange,
  onDoneEditingScheduledChange,
}: {
  enableScheduling?: boolean;
  editingScheduledChange?: ScheduledChangeRow | null;
  onDoneEditingScheduledChange?: () => void;
} = {}) {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: roles, isLoading } = useQuery({ queryKey: ["roles"], queryFn: async () => (await axiosClient.get("/roles")).data as Role[] });
  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? roles?.[0];

  const [draft, setDraft] = useState<RolePermission[] | null>(null);

  useEffect(() => {
    if (editingScheduledChange?.targetId) {
      setSelectedRoleId(editingScheduledChange.targetId);
      setDraft((editingScheduledChange.payload as { permissions: RolePermission[] }).permissions);
    }
  }, [editingScheduledChange]);

  const activePermissions = draft ?? selectedRole?.permissions ?? [];

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put(`/roles/${selectedRole!.id}/permissions`, { permissions: buildFullMatrix(activePermissions) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["roles"] }); setDraft(null); },
  });

  const updateScheduledMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/scheduled-changes/${editingScheduledChange!.id}`, { payload: { permissions: buildFullMatrix(activePermissions) } }),
    onSuccess: () => {
      showToast({ variant: "success", title: "Scheduled change updated", message: "The changes you made were saved to the pending schedule." });
      queryClient.invalidateQueries({ queryKey: ["scheduled-changes"] });
      setDraft(null);
      onDoneEditingScheduledChange?.();
    },
  });

  function handleSaveClick() {
    if (editingScheduledChange) updateScheduledMutation.mutate();
    else if (enableScheduling) setShowPublishModal(true);
    else saveMutation.mutate();
  }

  const savingSchedule = editingScheduledChange ? updateScheduledMutation.isPending : saveMutation.isPending;

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description: string }) => axiosClient.post("/roles", values),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ["roles"] }); setShowCreate(false); setSelectedRoleId(res.data.id); },
  });

  function buildFullMatrix(perms: RolePermission[]): RolePermission[] {
    return MODULES.map((m) => perms.find((p) => p.module === m) ?? { module: m, canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false });
  }

  const isSystemAdminRole = selectedRole?.name === "System Admin";

  function toggle(module: ModuleName, action: PermAction) {
    if (isSystemAdminRole) return;
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
            {isSystemAdminRole ? (
              <span className="muted" style={{ fontSize: 12 }}>Always full access — cannot be edited.</span>
            ) : (
              <button className="btn btn-primary btn-sm" disabled={!draft || savingSchedule} onClick={handleSaveClick}>
                {savingSchedule ? "Saving..." : editingScheduledChange ? "Update Scheduled Change" : "Save Permissions"}
              </button>
            )}
          </div>

          {editingScheduledChange && (
            <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 10 }}>
              Editing scheduled change #{editingScheduledChange.id} — saving here updates the pending schedule instead of publishing immediately.{" "}
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => { setDraft(null); onDoneEditingScheduledChange?.(); }}>Stop Editing</button>
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  {ACTIONS.map((a) => <th key={a} style={{ textAlign: "center" }}>{ACTION_LABELS[a]}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.filter((module) => module !== "app-settings" || isSystemAdminRole).map((module) => {
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
                          <input
                            type="checkbox"
                            checked={isSystemAdminRole ? true : perm[a]}
                            disabled={isSystemAdminRole}
                            onChange={() => toggle(module, a)}
                          />
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

      {showPublishModal && selectedRole && (
        <PublishOrScheduleModal
          title="Save Role Permissions"
          changeType="ROLE_PERMISSIONS"
          targetId={selectedRole.id}
          payload={{ permissions: buildFullMatrix(activePermissions) }}
          onPublishNow={async () => { await saveMutation.mutateAsync(); }}
          publishing={saveMutation.isPending}
          onScheduled={() => setShowPublishModal(false)}
          onClose={() => setShowPublishModal(false)}
        />
      )}
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
