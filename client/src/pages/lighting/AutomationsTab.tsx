import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { LightingDevice } from "./LightingDeviceCard";
import { DeviceActionPicker, DraftAction, actionsToDrafts, draftsToActions } from "./DeviceActionPicker";
import { ChipSelect } from "../../components/ChipSelect";

interface AutomationRun {
  id: number;
  automationId: number | null;
  automationName: string;
  trigger: "ON" | "OFF";
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  deviceCount: number;
  failedCount: number;
  message: string | null;
  ranAt: string;
}

const RUN_STATUS_TONE: Record<AutomationRun["status"], string> = {
  SUCCESS: "badge-success",
  PARTIAL: "badge-warning",
  FAILED: "badge-danger",
};

interface Scene {
  id: number;
  name: string;
}
interface AutomationAction {
  id: number;
  deviceId: number;
  turnOn: boolean;
  brightness: number | null;
  device: { id: number; name: string };
}
interface Automation {
  id: number;
  name: string;
  isEnabled: boolean;
  daysOfWeek: number[];
  timeOfDay: string;
  actionType: "DEVICE" | "SCENE";
  actions: AutomationAction[];
  targetSceneId: number | null;
  targetScene: { id: number; name: string } | null;
  offTimeOfDay: string | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysSummary(days: number[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Weekdays";
  if (days.length === 2 && [0, 6].every((d) => days.includes(d))) return "Weekends";
  return [...days].sort().map((d) => DAY_LABELS[d]).join(", ");
}

function actionSummary(a: Automation): string {
  if (a.actionType === "SCENE") return `Activate "${a.targetScene?.name ?? "scene"}"`;
  if (a.actions.length === 0) return "No devices selected";
  if (a.actions.length === 1) {
    const only = a.actions[0];
    return `Turn ${only.turnOn ? "On" : "Off"} "${only.device.name}"`;
  }
  const names = a.actions.slice(0, 2).map((x) => x.device.name).join(", ");
  const rest = a.actions.length - 2;
  return `${names}${rest > 0 ? ` +${rest} more` : ""}`;
}

export function AutomationsTab() {
  const [view, setView] = useState<"list" | "calendar" | "log">("list");
  const [logPage, setLogPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const queryClient = useQueryClient();

  const { data: automations, isLoading } = useQuery({
    queryKey: ["lighting-automations"],
    queryFn: async () => (await axiosClient.get("/lighting/automations")).data as Automation[],
  });
  const { data: devices } = useQuery({ queryKey: ["lighting-devices"], queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[] });
  const { data: scenes } = useQuery({ queryKey: ["lighting-scenes"], queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as Scene[] });

  const { data: runsPage, isLoading: runsLoading } = useQuery({
    queryKey: ["lighting-automation-runs", logPage],
    queryFn: async () => (await axiosClient.get(`/lighting/automations/runs?page=${logPage}&pageSize=25`)).data as { runs: AutomationRun[]; total: number; page: number; pageSize: number },
    enabled: view === "log",
    refetchInterval: view === "log" ? 15000 : false,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["lighting-automations"] });
  }

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) => axiosClient.patch(`/lighting/automations/${id}`, { isEnabled }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/automations/${id}`),
    onSuccess: () => { invalidate(); setDeleting(null); },
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/automations/${id}/duplicate`),
    onSuccess: invalidate,
  });

  const runColumns: ColumnDef<AutomationRun, any>[] = [
    { header: "Time", accessorFn: (r) => r.ranAt, cell: ({ row }) => dayjs(row.original.ranAt).format("DD MMM, HH:mm:ss") },
    { header: "Automation", accessorFn: (r) => r.automationName },
    { header: "Trigger", cell: ({ row }) => <span className="badge badge-neutral">{row.original.trigger}</span> },
    { header: "Status", cell: ({ row }) => <span className={`badge ${RUN_STATUS_TONE[row.original.status]}`}>{row.original.status}</span> },
    { header: "Devices", accessorFn: (r) => `${r.deviceCount - r.failedCount}/${r.deviceCount} succeeded` },
    { header: "Detail", accessorFn: (r) => r.message ?? "—" },
  ];

  const calendarCells = useMemo(() => {
    const startOfGrid = month.startOf("month").startOf("week");
    return Array.from({ length: 42 }, (_, i) => startOfGrid.add(i, "day"));
  }, [month]);

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <div className="row gap-2">
          <button className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("list")}>List</button>
          <button className={`btn btn-sm ${view === "calendar" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("calendar")}>Calendar</button>
          <button className={`btn btn-sm ${view === "log" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("log")}>Log</button>
        </div>
        <PermissionGate module="lighting" action="create">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> Add Automation</button>
        </PermissionGate>
      </div>

      {isLoading && <Skeleton height={160} />}

      {!isLoading && view === "list" && (
        <div className="stack gap-2">
          {automations?.length === 0 && <div className="empty-state card">No automations yet — schedule when a light or scene turns on or off.</div>}
          {automations?.map((a) => (
            <div key={a.id} className="card row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{a.name}</strong>
                  {!a.isEnabled && <span className="badge badge-neutral">Disabled</span>}
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  {daysSummary(a.daysOfWeek)} · On {a.timeOfDay}{a.offTimeOfDay ? ` → Off ${a.offTimeOfDay}` : ""} · {actionSummary(a)}
                </p>
              </div>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <PermissionGate module="lighting" action="edit">
                  <label className="form-toggle-switch" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={a.isEnabled} onChange={(e) => toggleMutation.mutate({ id: a.id, isEnabled: e.target.checked })} />
                    <span className="form-toggle-switch-track" />
                  </label>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditing(a)}><Icon name="edit" size={12} /></button>
                </PermissionGate>
                <PermissionGate module="lighting" action="create">
                  <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(a.id)}><Icon name="paperclip" size={12} /></button>
                </PermissionGate>
                <PermissionGate module="lighting" action="delete">
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(a)}><Icon name="trash" size={12} /></button>
                </PermissionGate>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && view === "calendar" && (
        <div className="card">
          <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth((m) => m.subtract(1, "month"))}>‹</button>
            <strong style={{ fontSize: 14 }}>{month.format("MMMM YYYY")}</strong>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth((m) => m.add(1, "month"))}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {DAY_LABELS.map((d) => <div key={d} className="muted" style={{ fontSize: 11, textAlign: "center", padding: "4px 0" }}>{d}</div>)}
            {calendarCells.map((cell) => {
              const inMonth = cell.month() === month.month();
              const isToday = cell.isSame(dayjs(), "day");
              const dayAutomations = (automations ?? []).filter((a) => a.isEnabled && a.daysOfWeek.includes(cell.day()));
              return (
                <div
                  key={cell.format("YYYY-MM-DD")}
                  style={{
                    minHeight: 72, borderRadius: 6, padding: 4, border: isToday ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                    opacity: inMonth ? 1 : 0.4, background: "var(--color-surface)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 11 }}>{cell.date()}</div>
                  <div className="stack gap-1" style={{ marginTop: 2 }}>
                    {dayAutomations.slice(0, 3).map((a) => (
                      <button
                        key={a.id}
                        className="badge badge-primary"
                        style={{ border: "none", cursor: "pointer", fontSize: 10, textAlign: "left", padding: "2px 4px" }}
                        onClick={() => setEditing(a)}
                        title={`On ${a.timeOfDay}${a.offTimeOfDay ? ` → Off ${a.offTimeOfDay}` : ""} · ${actionSummary(a)}`}
                      >
                        {a.timeOfDay} {a.name}
                      </button>
                    ))}
                    {dayAutomations.length > 3 && <span className="muted" style={{ fontSize: 10 }}>+{dayAutomations.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "log" && (
        <div className="card">
          <h3 className="mt-0">Automation Run Log</h3>
          <p className="muted" style={{ marginTop: -6 }}>
            One row per time the scheduler actually fired an automation's on- or off-leg, with a per-run device success/failure count.
          </p>
          <DataTable
            tableId="lighting.automationRuns"
            exportModule="lighting"
            defaultViewMode="list"
            columns={runColumns}
            data={runsPage?.runs ?? []}
            isLoading={runsLoading}
            emptyMessage="No automations have fired yet."
            // Only one server page of runs is loaded at a time (Prev/Next below manage logPage
            // directly) — DataTable's client-side search would silently search just this page.
            searchable={false}
          />
          {runsPage && runsPage.total > runsPage.pageSize && (
            <div className="row gap-2" style={{ justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={logPage <= 1} onClick={() => setLogPage((p) => p - 1)}>‹ Prev</button>
              <span className="muted" style={{ fontSize: 12 }}>Page {runsPage.page} of {Math.max(1, Math.ceil(runsPage.total / runsPage.pageSize))}</span>
              <button className="btn btn-secondary btn-sm" disabled={logPage * runsPage.pageSize >= runsPage.total} onClick={() => setLogPage((p) => p + 1)}>Next ›</button>
            </div>
          )}
        </div>
      )}

      {(showForm || editing) && (
        <AutomationFormModal automation={editing} devices={devices ?? []} scenes={scenes ?? []} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={invalidate} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete automation"
          message={`Delete "${deleting.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function AutomationFormModal({
  automation,
  devices,
  scenes,
  onClose,
  onSaved,
}: {
  automation: Automation | null;
  devices: LightingDevice[];
  scenes: Scene[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(automation?.name ?? "");
  const [days, setDays] = useState<Set<number>>(new Set(automation?.daysOfWeek ?? [1, 2, 3, 4, 5]));
  const [timeOfDay, setTimeOfDay] = useState(automation?.timeOfDay ?? "18:00");
  const [actionType, setActionType] = useState<"DEVICE" | "SCENE">(automation?.actionType ?? "DEVICE");
  const [drafts, setDrafts] = useState<Map<number, DraftAction>>(actionsToDrafts(automation?.actions ?? []));
  const [targetSceneId, setTargetSceneId] = useState<number | "">(automation?.targetSceneId ?? "");
  const [offEnabled, setOffEnabled] = useState(automation?.offTimeOfDay != null);
  const [offTimeOfDay, setOffTimeOfDay] = useState(automation?.offTimeOfDay ?? "23:00");

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name,
        daysOfWeek: [...days],
        timeOfDay,
        actionType,
        actions: actionType === "DEVICE" ? draftsToActions(drafts) : undefined,
        targetSceneId: actionType === "SCENE" ? Number(targetSceneId) : null,
        offTimeOfDay: actionType === "DEVICE" && offEnabled ? offTimeOfDay : null,
      };
      return automation ? axiosClient.patch(`/lighting/automations/${automation.id}`, body) : axiosClient.post("/lighting/automations", body);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  const canSubmit =
    name.trim() &&
    days.size > 0 &&
    (actionType === "DEVICE" ? drafts.size > 0 : targetSceneId !== "") &&
    (actionType !== "DEVICE" || !offEnabled || offTimeOfDay !== timeOfDay);

  return (
    <FormModal title={automation ? "Edit Automation" : "Add Automation"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!canSubmit}>
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save this automation."}</div>}
      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Evening porch light" /></div>

      <div className="field">
        <label>Days *</label>
        <div className="row gap-1 flex-wrap">
          {DAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`btn btn-sm ${days.has(i) ? "btn-primary" : "btn-secondary"}`}
              onClick={() => toggleDay(i)}
              style={{ minWidth: 44 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="field"><label>Time *</label><input className="input" type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} /></div>
        <div className="field">
          <label>Action</label>
          <ChipSelect
            value={actionType}
            onChange={(v) => setActionType(v as "DEVICE" | "SCENE")}
            options={[
              { value: "DEVICE", label: "Turn a device on/off" },
              { value: "SCENE", label: "Activate a scene" },
            ]}
          />
        </div>
      </div>

      {actionType === "DEVICE" && (
        <div className="field">
          <label className="row gap-2" style={{ cursor: "pointer", alignItems: "center" }}>
            <input type="checkbox" checked={offEnabled} onChange={(e) => setOffEnabled(e.target.checked)} />
            Also turn these devices off at a time
          </label>
          {offEnabled && (
            <input className="input" type="time" style={{ marginTop: 6 }} value={offTimeOfDay} onChange={(e) => setOffTimeOfDay(e.target.value)} />
          )}
          {offEnabled && offTimeOfDay === timeOfDay && (
            <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "4px 0 0" }}>Off time must be different from the on time.</p>
          )}
        </div>
      )}

      {actionType === "DEVICE" ? (
        <DeviceActionPicker devices={devices} drafts={drafts} onChange={setDrafts} />
      ) : (
        <div className="field">
          <label>Scene *</label>
          <ChipSelect
            value={String(targetSceneId)}
            onChange={(v) => setTargetSceneId(v ? Number(v) : "")}
            placeholder="Select scene..."
            options={[{ value: "", label: "Select scene..." }, ...scenes.map((s) => ({ value: String(s.id), label: s.name }))]}
          />
          {scenes.length === 0 && <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>No scenes yet — add one under the Scenes tab first.</p>}
        </div>
      )}
    </FormModal>
  );
}
