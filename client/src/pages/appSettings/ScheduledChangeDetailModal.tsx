import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/toast/ToastProvider";
import { CHANGE_TYPE_INFO, ScheduledChangeRow } from "./scheduledChangeTypes";
import { PermissionGate } from "../../auth/PermissionGate";

function nowLocalDatetime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DiffRow({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border)", fontSize: 12 }}>
      <span style={{ fontWeight: 600, minWidth: 140 }}>{label}</span>
      <div className="row gap-2" style={{ flex: 1, justifyContent: "flex-end" }}>
        {changed ? (
          <>
            <span className="muted" style={{ textDecoration: "line-through" }}>{before}</span>
            <Icon name="arrowRight" size={12} />
            <strong>{after}</strong>
          </>
        ) : (
          <span>{after}</span>
        )}
      </div>
    </div>
  );
}

function SettingsDiff({ before, after }: { before: Record<string, string> | undefined; after: Record<string, string> }) {
  const keys = Array.from(new Set([...(before ? Object.keys(before) : []), ...Object.keys(after)])).sort();
  if (keys.length === 0) return <p className="muted">No values recorded.</p>;
  return (
    <div>
      {keys.map((k) => (
        <DiffRow key={k} label={k} before={before?.[k] ?? "—"} after={after[k] ?? "—"} changed={(before?.[k] ?? "") !== (after[k] ?? "")} />
      ))}
    </div>
  );
}

function BackupDiff({ before, after }: { before: any; after: any }) {
  const fmt = (v: any) => {
    if (v == null) return "—";
    if (Array.isArray(v)) return v.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") || "None";
    return String(v);
  };
  const rows: { label: string; key: string }[] = [
    { label: "Enabled", key: "isEnabled" },
    { label: "Days", key: "daysOfWeek" },
    { label: "Time", key: "timeOfDay" },
  ];
  return (
    <div>
      {rows.map((r) => (
        <DiffRow
          key={r.key}
          label={r.label}
          before={fmt(before?.[r.key])}
          after={fmt(after?.[r.key])}
          changed={JSON.stringify(before?.[r.key]) !== JSON.stringify(after?.[r.key])}
        />
      ))}
    </div>
  );
}

const PERM_ACTIONS = ["canView", "canCreate", "canEdit", "canDelete", "canExport"] as const;
const PERM_LABELS: Record<string, string> = { canView: "V", canCreate: "C", canEdit: "E", canDelete: "D", canExport: "X" };

function RolePermissionsDiff({ before, after }: { before: any[] | undefined; after: any[] }) {
  const modules = Array.from(new Set([...(before ?? []).map((p) => p.module), ...after.map((p) => p.module)])).sort();
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ fontSize: 11 }}>
        <thead>
          <tr>
            <th>Module</th>
            {PERM_ACTIONS.map((a) => <th key={a} style={{ textAlign: "center" }}>{PERM_LABELS[a]}</th>)}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const b = before?.find((p) => p.module === m);
            const a = after.find((p) => p.module === m);
            return (
              <tr key={m}>
                <td>{m}</td>
                {PERM_ACTIONS.map((act) => {
                  const bv = !!b?.[act];
                  const av = !!a?.[act];
                  const changed = bv !== av;
                  return (
                    <td key={act} style={{ textAlign: "center", background: changed ? "var(--color-warning-soft)" : undefined }}>
                      {av ? "✓" : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduledChangeDetailModal({
  change,
  onClose,
  onEdit,
}: {
  change: ScheduledChangeRow;
  onClose: () => void;
  onEdit: (change: ScheduledChangeRow) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState(nowLocalDatetime());

  function invalidateAndClose() {
    queryClient.invalidateQueries({ queryKey: ["scheduled-changes"] });
  }

  const publishNowMutation = useMutation({
    mutationFn: () => axiosClient.post(`/scheduled-changes/${change.id}/publish-now`),
    onSuccess: () => {
      showToast({ variant: "success", title: "Change published", message: "It's taken effect immediately." });
      invalidateAndClose();
      onClose();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => axiosClient.post(`/scheduled-changes/${change.id}/cancel`),
    onSuccess: () => {
      showToast({ variant: "success", title: "Change cancelled", message: "This scheduled change will not be applied." });
      invalidateAndClose();
      onClose();
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/scheduled-changes/${change.id}`, { scheduledFor: new Date(rescheduleValue).toISOString() }),
    onSuccess: () => {
      showToast({ variant: "success", title: "Rescheduled", message: "This change's publish time has been updated." });
      invalidateAndClose();
      onClose();
    },
  });

  const isPending = change.status === "PENDING";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{CHANGE_TYPE_INFO[change.changeType].label}</h3>
          <button className="modal-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="stack gap-3">
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <StatusBadge status={change.status} />
            <span className="muted" style={{ fontSize: 12 }}>{change.summary}</span>
          </div>

          <div className="row gap-3" style={{ fontSize: 12 }}>
            <div>
              <div className="muted">Scheduled for</div>
              <strong>{dayjs(change.scheduledFor).format("DD MMM YYYY, HH:mm")}</strong>
            </div>
            {change.publishedAt && (
              <div>
                <div className="muted">Published at</div>
                <strong>{dayjs(change.publishedAt).format("DD MMM YYYY, HH:mm")}</strong>
              </div>
            )}
            {change.cancelledAt && (
              <div>
                <div className="muted">Cancelled at</div>
                <strong>{dayjs(change.cancelledAt).format("DD MMM YYYY, HH:mm")}</strong>
              </div>
            )}
          </div>

          {change.status === "FAILED" && change.errorMessage && (
            <div className="alert alert-danger" style={{ fontSize: 12 }}>{change.errorMessage}</div>
          )}

          <div>
            <h4 style={{ marginBottom: 6 }}>Changes</h4>
            {change.changeType === "SYSTEM_SETTINGS" && (
              <SettingsDiff before={change.beforeSnapshot?.values} after={change.payload?.values ?? {}} />
            )}
            {change.changeType === "BACKUP_SETTINGS" && (
              <BackupDiff before={change.beforeSnapshot} after={change.payload} />
            )}
            {change.changeType === "ROLE_PERMISSIONS" && (
              <RolePermissionsDiff before={change.beforeSnapshot?.permissions} after={change.payload?.permissions ?? []} />
            )}
          </div>

          {isPending && rescheduling && (
            <div className="field">
              <label>New scheduled time</label>
              <div className="row gap-2">
                <input
                  type="datetime-local"
                  className="input ad-input"
                  value={rescheduleValue}
                  min={nowLocalDatetime()}
                  onChange={(e) => setRescheduleValue(e.target.value)}
                />
                <PermissionGate module="app-settings" action="edit">
                  <button className="btn btn-primary btn-sm" disabled={rescheduleMutation.isPending} onClick={() => rescheduleMutation.mutate()}>
                    {rescheduleMutation.isPending ? "Saving..." : "Confirm"}
                  </button>
                </PermissionGate>
                <button className="btn btn-secondary btn-sm" onClick={() => setRescheduling(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ flexWrap: "wrap" }}>
          {isPending ? (
            <PermissionGate module="app-settings" action="edit">
              <button className="btn btn-danger" disabled={cancelMutation.isPending} onClick={() => setConfirmingCancel(true)}>
                Cancel Change
              </button>
              <button className="btn btn-secondary" onClick={() => setRescheduling((r) => !r)}>
                <Icon name="clock" size={13} /> Reschedule
              </button>
              <button className="btn btn-secondary" onClick={() => onEdit(change)}>
                <Icon name="edit" size={13} /> Edit
              </button>
              <button className="btn btn-primary" disabled={publishNowMutation.isPending} onClick={() => publishNowMutation.mutate()}>
                {publishNowMutation.isPending ? "Publishing..." : "Publish Now"}
              </button>
            </PermissionGate>
          ) : (
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          )}
        </div>
      </div>

      {confirmingCancel && (
        <ConfirmDialog
          title="Cancel this scheduled change?"
          message="It will not be applied. This cannot be undone, but you can always schedule a new change with the same values."
          danger
          loading={cancelMutation.isPending}
          onCancel={() => setConfirmingCancel(false)}
          onConfirm={() => cancelMutation.mutate()}
        />
      )}
    </div>
  );
}
