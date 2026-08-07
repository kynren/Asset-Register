import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { useToast } from "../../components/toast/ToastProvider";
import { copyToClipboard } from "../../lib/clipboard";
import { PublishOrScheduleModal } from "./PublishOrScheduleModal";
import { ScheduledChangeRow } from "./scheduledChangeTypes";
import { PermissionGate } from "../../auth/PermissionGate";

export function SystemSettingsTab({
  editingScheduledChange,
  onDoneEditingScheduledChange,
}: {
  editingScheduledChange?: ScheduledChangeRow | null;
  onDoneEditingScheduledChange?: () => void;
} = {}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: settings } = useQuery({ queryKey: ["system-settings"], queryFn: async () => (await axiosClient.get("/settings")).data });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  // While editing a pending scheduled change, the form is seeded from ITS payload instead of the
  // live settings — so Save re-targets that same change instead of publishing live or scheduling
  // a brand new one.
  useEffect(() => {
    if (editingScheduledChange) setValues(editingScheduledChange.payload.values ?? {});
    else if (settings) setValues(settings);
  }, [settings, editingScheduledChange]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/settings", { values }),
    onSuccess: () => { setSaved(true); queryClient.invalidateQueries({ queryKey: ["system-settings"] }); setTimeout(() => setSaved(false), 2000); },
  });

  const updateScheduledMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/scheduled-changes/${editingScheduledChange!.id}`, { payload: { values } }),
    onSuccess: () => {
      showToast({ variant: "success", title: "Scheduled change updated", message: "The changes you made were saved to the pending schedule." });
      queryClient.invalidateQueries({ queryKey: ["scheduled-changes"] });
      onDoneEditingScheduledChange?.();
    },
  });

  function handleSaveClick() {
    if (editingScheduledChange) updateScheduledMutation.mutate();
    else setShowPublishModal(true);
  }

  const saving = editingScheduledChange ? updateScheduledMutation.isPending : saveMutation.isPending;

  const { data: agentKeys } = useQuery({ queryKey: ["agent-keys"], queryFn: async () => (await axiosClient.get("/settings/agent-keys")).data });
  // The create response is the ONLY place the full key is ever available — the list below always
  // shows a truncated preview (same "can't be retrieved again" convention as the password vault),
  // so this has to be captured here and shown once, with a copy button, or the key is unusable.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const createKeyMutation = useMutation({
    mutationFn: (label: string) => axiosClient.post("/settings/agent-keys", { label }),
    onSuccess: (res) => {
      setNewKey(res.data.key);
      setKeyCopied(false);
      queryClient.invalidateQueries({ queryKey: ["agent-keys"] });
    },
  });

  async function copyNewKey() {
    if (!newKey) return;
    await copyToClipboard(newKey, "Agent key copied to clipboard");
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1800);
  }
  const toggleKeyMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/settings/agent-keys/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-keys"] }),
  });

  const agentKeyColumns: ColumnDef<any, any>[] = [
    { header: "Label", accessorFn: (k) => k.label ?? "—" },
    { header: "Key", cell: ({ row }) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{row.original.key.slice(0, 16)}...</span> },
    { header: "Created", accessorFn: (k) => dayjs(k.createdAt).format("DD MMM YYYY") },
    { header: "Status", cell: ({ row }) => (row.original.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Revoked</span>) },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <PermissionGate module="app-settings" action="edit">
          <button className="btn btn-secondary btn-sm" onClick={() => toggleKeyMutation.mutate({ id: row.original.id, isActive: !row.original.isActive })}>
            {row.original.isActive ? "Revoke" : "Reactivate"}
          </button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="stack gap-3">
      {editingScheduledChange && (
        <div className="alert alert-warning row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span>Editing scheduled change #{editingScheduledChange.id} — saving here updates the scheduled change, it does not apply anything live.</span>
          <button className="btn btn-secondary btn-sm" onClick={onDoneEditingScheduledChange}>Stop editing</button>
        </div>
      )}

      <div className="row gap-3 flex-wrap" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ maxWidth: 480, flex: "1 1 380px" }}>
          <h3 className="mt-0">General Settings</h3>
          {saved && <div className="alert alert-success">Settings saved.</div>}
          <div className="field"><label>Minimum Password Length</label><input className="input" type="number" value={values.passwordMinLength ?? ""} onChange={(e) => setValues((v) => ({ ...v, passwordMinLength: e.target.value }))} /></div>
          <div className="field"><label>Device Offline Threshold (minutes)</label><input className="input" type="number" value={values.deviceOfflineThresholdMinutes ?? ""} onChange={(e) => setValues((v) => ({ ...v, deviceOfflineThresholdMinutes: e.target.value }))} /></div>
          <div className="field"><label>Camera Recording Retention (days)</label><input className="input" type="number" value={values.cameraRetentionDays ?? ""} onChange={(e) => setValues((v) => ({ ...v, cameraRetentionDays: e.target.value }))} /></div>
          <div className="field"><label>Decrypted Password Auto-Lock (seconds)</label><input className="input" type="number" value={values.vaultDecryptTimeoutSeconds ?? ""} onChange={(e) => setValues((v) => ({ ...v, vaultDecryptTimeoutSeconds: e.target.value }))} /></div>
          <div className="field">
            <label>Stock SKU Prefix</label>
            <input
              className="input"
              placeholder="KYN"
              maxLength={10}
              value={values.stockSkuPrefix ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, stockSkuPrefix: e.target.value.toUpperCase() }))}
            />
          </div>
          <PermissionGate module="app-settings" action="edit">
            <button className="btn btn-primary" onClick={handleSaveClick} disabled={saving}>
              {saving ? "Please wait..." : editingScheduledChange ? "Update Scheduled Change" : "Save"}
            </button>
          </PermissionGate>
        </div>

        <div className="card" style={{ maxWidth: 480, flex: "1 1 380px" }}>
          <h3 className="mt-0">Password &amp; Login Security Policy</h3>
          <div className="field">
            <label className="row gap-2" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={values.passwordRequireComplexity === "true"}
                onChange={(e) => setValues((v) => ({ ...v, passwordRequireComplexity: e.target.checked ? "true" : "false" }))}
              />
              Require uppercase, lowercase, number &amp; symbol
            </label>
          </div>
          <div className="field"><label>Password Expiry (days, blank = never)</label><input className="input" type="number" value={values.passwordMaxAgeDays ?? ""} onChange={(e) => setValues((v) => ({ ...v, passwordMaxAgeDays: e.target.value }))} /></div>
          <div className="field"><label>Prevent Reuse of Last N Passwords</label><input className="input" type="number" value={values.passwordHistoryCount ?? ""} onChange={(e) => setValues((v) => ({ ...v, passwordHistoryCount: e.target.value }))} /></div>
          <div className="field"><label>Max Failed Login Attempts</label><input className="input" type="number" value={values.maxFailedLoginAttempts ?? ""} onChange={(e) => setValues((v) => ({ ...v, maxFailedLoginAttempts: e.target.value }))} /></div>
          <div className="field"><label>Lockout Duration (minutes)</label><input className="input" type="number" value={values.lockoutDurationMinutes ?? ""} onChange={(e) => setValues((v) => ({ ...v, lockoutDurationMinutes: e.target.value }))} /></div>
          <PermissionGate module="app-settings" action="edit">
            <button className="btn btn-primary" onClick={handleSaveClick} disabled={saving}>
              {saving ? "Please wait..." : editingScheduledChange ? "Update Scheduled Change" : "Save"}
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3 className="mt-0">Network Relay Agent</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          If this app is hosted on a cloud VPS, it has no network route into your office's private LAN — the IP Range
          Scanner, ICMP Pinger, continuous Monitoring, NVR/Camera and Access Control device calls, Lighting device
          control, and Asset ping/heartbeat can't reach local devices no matter what runs on the server. Enable this
          once you have <code>agent/kynren_network_relay.py</code> running on a machine inside the LAN: every one of
          those device calls then routes through that relay instead of running (and failing) directly on the server.
          Not needed if this app is self-hosted on a machine already inside the LAN.
        </p>
        <div className="field">
          <label className="row gap-2" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={values.networkRelayEnabled === "true"}
              onChange={(e) => setValues((v) => ({ ...v, networkRelayEnabled: e.target.checked ? "true" : "false" }))}
            />
            Route network scans through an on-prem relay agent
          </label>
        </div>
        <PermissionGate module="app-settings" action="edit">
          <button className="btn btn-primary" onClick={handleSaveClick} disabled={saving}>
            {saving ? "Please wait..." : editingScheduledChange ? "Update Scheduled Change" : "Save"}
          </button>
        </PermissionGate>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="mt-0">Agent API Keys</h3>
          <PermissionGate module="app-settings" action="create">
            <button className="btn btn-secondary btn-sm" onClick={() => createKeyMutation.mutate("New Key")}><Icon name="plus" size={13} /> Generate Key</button>
          </PermissionGate>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Shared by both agents: the per-machine device agent's <code>.env</code> as <code>AGENT_API_KEY</code>, and the
          network relay agent's <code>.env</code> as <code>AGENT_API_KEY</code> (above).
        </p>
        {newKey && (
          <div className="alert alert-success" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <strong>Key generated — copy it now, it won't be shown again:</strong>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <code style={{ fontSize: 12, wordBreak: "break-all", flex: 1 }}>{newKey}</code>
              <button className="btn btn-secondary btn-sm" onClick={copyNewKey}>{keyCopied ? "Copied!" : "Copy"}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setNewKey(null)}>Dismiss</button>
            </div>
          </div>
        )}
        <DataTable tableId="appSettings.agentKeys" defaultViewMode="list" columns={agentKeyColumns} data={agentKeys ?? []} clientPageSize={5} exportModule="app-settings" />
      </div>

      {showPublishModal && (
        <PublishOrScheduleModal
          title="Save System Settings"
          changeType="SYSTEM_SETTINGS"
          payload={{ values }}
          onPublishNow={async () => { await saveMutation.mutateAsync(); }}
          publishing={saveMutation.isPending}
          onScheduled={() => setShowPublishModal(false)}
          onClose={() => setShowPublishModal(false)}
        />
      )}
    </div>
  );
}
