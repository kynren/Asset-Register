import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { useToast } from "../../components/toast/ToastProvider";
import { ScheduledChangeType } from "./scheduledChangeTypes";

interface PublishOrScheduleModalProps {
  title: string;
  changeType: ScheduledChangeType;
  payload: Record<string, unknown>;
  targetId?: number;
  onPublishNow: () => void | Promise<void>;
  publishing?: boolean;
  onScheduled: () => void;
  onClose: () => void;
}

function nowLocalDatetime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000); // default to 5 minutes out, not "now"
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The "Publish Now vs Schedule for Later" choice shown before any App-Settings-context save
// (System Settings, Backup Schedule, or Role Permissions). Publish Now calls the SAME immediate
// mutation each tab already had — this modal never changes that path. Schedule posts a new
// ScheduledChange instead, picked up by the scheduler (see server lib/scheduledChangeScheduler.ts)
// or published early from the Change Management tab.
export function PublishOrScheduleModal({ title, changeType, payload, targetId, onPublishNow, publishing, onScheduled, onClose }: PublishOrScheduleModalProps) {
  const [mode, setMode] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState(nowLocalDatetime());
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const scheduleMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/scheduled-changes", {
        changeType,
        payload,
        ...(targetId !== undefined ? { targetId } : {}),
        scheduledFor: new Date(scheduledFor).toISOString(),
      }),
    onSuccess: () => {
      showToast({ variant: "success", title: "Change scheduled", message: "It'll publish automatically at the time you picked — track it in Change Management." });
      queryClient.invalidateQueries({ queryKey: ["scheduled-changes"] });
      onScheduled();
    },
  });

  const conflictMessage =
    (scheduleMutation.error as any)?.response?.status === 409
      ? (scheduleMutation.error as any)?.response?.data?.error ?? "There's already a pending scheduled change for this."
      : null;

  async function handleConfirm() {
    if (mode === "now") {
      await onPublishNow();
      onClose();
    } else {
      scheduleMutation.mutate();
    }
  }

  const busy = mode === "now" ? !!publishing : scheduleMutation.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3></div>

        {conflictMessage && (
          <div className="alert alert-warning" style={{ fontSize: 12 }}>
            {conflictMessage} Open the Change Management tab to edit or cancel it first.
          </div>
        )}

        <div className="stack gap-2">
          <label className="row gap-2" style={{ cursor: "pointer", alignItems: "flex-start" }}>
            <input type="radio" name="publish-mode" checked={mode === "now"} onChange={() => setMode("now")} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Publish now</div>
              <div className="muted" style={{ fontSize: 12 }}>Takes effect immediately for this organization's users.</div>
            </div>
          </label>
          <label className="row gap-2" style={{ cursor: "pointer", alignItems: "flex-start" }}>
            <input type="radio" name="publish-mode" checked={mode === "later"} onChange={() => setMode("later")} style={{ marginTop: 3 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Schedule for later</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Applies automatically at the time below — avoids disrupting live users right now.</div>
              {mode === "later" && (
                <input
                  type="datetime-local"
                  className="input ad-input"
                  value={scheduledFor}
                  min={nowLocalDatetime()}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              )}
            </div>
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={busy}>
            {busy ? "Please wait..." : mode === "now" ? "Publish Now" : "Schedule Change"}
          </button>
        </div>
      </div>
    </div>
  );
}
