import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PasswordInput } from "../../components/PasswordInput";
import { PermissionGate } from "../../auth/PermissionGate";
import { ChipSelect } from "../../components/ChipSelect";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../components/toast/ToastProvider";
import { PublishOrScheduleModal } from "./PublishOrScheduleModal";
import { ScheduledChangeRow } from "./scheduledChangeTypes";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface BackupSettings {
  isEnabled: boolean;
  daysOfWeek: number[];
  timeOfDay: string;
}

interface BackupDestination {
  id: number;
  type: "EMAIL" | "S3";
  name: string;
  isEnabled: boolean;
  emailTo: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKeyId: string | null;
  s3PathPrefix: string | null;
  s3ForcePathStyle: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

interface BackupRunDestination {
  id: number;
  destinationName: string;
  destinationType: "EMAIL" | "S3";
  ok: boolean;
  message: string | null;
}
interface BackupRun {
  id: number;
  trigger: "SCHEDULED" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  fileSizeBytes: number | null;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  deliveries: BackupRunDestination[];
}

const RUN_STATUS_TONE: Record<BackupRun["status"], string> = {
  RUNNING: "badge-primary",
  SUCCESS: "badge-success",
  PARTIAL: "badge-warning",
  FAILED: "badge-danger",
};

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsTab({
  editingScheduledChange,
  onDoneEditingScheduledChange,
}: {
  editingScheduledChange?: ScheduledChangeRow | null;
  onDoneEditingScheduledChange?: () => void;
} = {}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<BackupSettings | null>(null);
  const [showAddDestination, setShowAddDestination] = useState(false);
  const [editingDestination, setEditingDestination] = useState<BackupDestination | null>(null);
  const [deletingDestination, setDeletingDestination] = useState<BackupDestination | null>(null);
  const [runPage, setRunPage] = useState(1);
  const [showPublishModal, setShowPublishModal] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["backup-settings"],
    queryFn: async () => (await axiosClient.get("/backups/settings")).data as BackupSettings,
  });
  const { data: destinations, isLoading: destinationsLoading } = useQuery({
    queryKey: ["backup-destinations"],
    queryFn: async () => (await axiosClient.get("/backups/destinations")).data as BackupDestination[],
  });
  const { data: runsPage, isLoading: runsLoading } = useQuery({
    queryKey: ["backup-runs", runPage],
    queryFn: async () => (await axiosClient.get(`/backups/runs?page=${runPage}&pageSize=15`)).data as { runs: BackupRun[]; total: number; page: number; pageSize: number },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (editingScheduledChange) setDraft(editingScheduledChange.payload as BackupSettings);
    else if (settings && !draft) setDraft(settings);
  }, [settings, draft, editingScheduledChange]);

  const saveSettingsMutation = useMutation({
    mutationFn: (values: BackupSettings) => axiosClient.put("/backups/settings", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backup-settings"] }),
  });

  const updateScheduledMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/scheduled-changes/${editingScheduledChange!.id}`, { payload: draft }),
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

  const savingSchedule = editingScheduledChange ? updateScheduledMutation.isPending : saveSettingsMutation.isPending;

  const deleteDestinationMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/backups/destinations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backup-destinations"] });
      setDeletingDestination(null);
    },
  });

  const testDestinationMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/backups/destinations/${id}/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backup-destinations"] }),
  });

  const runNowMutation = useMutation({
    mutationFn: () => axiosClient.post("/backups/run-now"),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["backup-runs"] }), 1500);
    },
  });

  function toggleDay(d: number) {
    if (!draft) return;
    const has = draft.daysOfWeek.includes(d);
    setDraft({ ...draft, daysOfWeek: has ? draft.daysOfWeek.filter((x) => x !== d) : [...draft.daysOfWeek, d] });
  }

  const runColumns: ColumnDef<BackupRun, any>[] = [
    { header: "Started", accessorFn: (r) => r.startedAt, cell: ({ row }) => dayjs(row.original.startedAt).format("DD MMM, HH:mm:ss") },
    { header: "Trigger", cell: ({ row }) => <span className="badge badge-neutral">{row.original.trigger}</span> },
    { header: "Status", cell: ({ row }) => <span className={`badge ${RUN_STATUS_TONE[row.original.status]}`}>{row.original.status}</span> },
    { header: "Size", accessorFn: (r) => formatBytes(r.fileSizeBytes) },
    {
      header: "Delivered To",
      cell: ({ row }) =>
        row.original.deliveries.length === 0 ? (
          <span className="muted">{row.original.message ?? "—"}</span>
        ) : (
          <div className="stack gap-1">
            {row.original.deliveries.map((d) => (
              <span key={d.id} className={`badge ${d.ok ? "badge-success" : "badge-danger"}`} title={d.message ?? undefined}>
                {d.destinationName}
              </span>
            ))}
          </div>
        ),
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="card">
        <h3 className="mt-0">Backup Schedule</h3>
        <p className="muted" style={{ marginTop: -6 }}>
          Runs a full database dump (via pg_dump) on the days/time below and pushes it to every enabled destination.
        </p>

        {editingScheduledChange && (
          <div className="alert alert-warning" style={{ fontSize: 12 }}>
            Editing scheduled change #{editingScheduledChange.id} — saving here updates the pending schedule instead of publishing immediately.{" "}
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => onDoneEditingScheduledChange?.()}>Stop Editing</button>
          </div>
        )}

        {draft && (
          <div className="stack gap-2">
            <label className="row gap-2" style={{ cursor: "pointer", alignItems: "center" }}>
              <input type="checkbox" checked={draft.isEnabled} onChange={(e) => setDraft({ ...draft, isEnabled: e.target.checked })} />
              Enabled
            </label>

            <div className="field">
              <label>Days</label>
              <div className="row gap-1 flex-wrap">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={`btn btn-sm ${draft.daysOfWeek.includes(i) ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => toggleDay(i)}
                    style={{ minWidth: 44 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field" style={{ width: 140 }}>
              <label>Time</label>
              <input className="input" type="time" value={draft.timeOfDay} onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })} />
            </div>

            <PermissionGate module="app-settings" action="edit">
              <div className="row gap-2">
                <button className="btn btn-primary btn-sm" disabled={savingSchedule} onClick={handleSaveClick}>
                  {savingSchedule ? "Saving..." : editingScheduledChange ? "Update Scheduled Change" : "Save Schedule"}
                </button>
                {!editingScheduledChange && (
                  <PermissionGate module="app-settings" action="create">
                    <button className="btn btn-secondary btn-sm" disabled={runNowMutation.isPending} onClick={() => runNowMutation.mutate()}>
                      <Icon name="refresh" size={12} /> {runNowMutation.isPending ? "Starting..." : "Run Now"}
                    </button>
                  </PermissionGate>
                )}
              </div>
            </PermissionGate>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h3 className="mt-0" style={{ marginBottom: 0 }}>Destinations</h3>
          <PermissionGate module="app-settings" action="create">
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddDestination(true)}>
              <Icon name="plus" size={12} /> Add Destination
            </button>
          </PermissionGate>
        </div>

        {destinationsLoading && <Skeleton height={80} />}
        {!destinationsLoading && (destinations?.length ?? 0) === 0 && (
          <p className="muted" style={{ fontSize: 12 }}>No destinations configured yet — backups have nowhere to go until you add one.</p>
        )}

        <div className="stack gap-2">
          {(destinations ?? []).map((d) => (
            <div key={d.id} className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{d.name}</strong>
                  <span className="badge badge-neutral">{d.type}</span>
                  {!d.isEnabled && <span className="badge badge-neutral">Disabled</span>}
                  {d.lastTestOk === true && <span className="badge badge-success">Connected</span>}
                  {d.lastTestOk === false && <span className="badge badge-danger" title={d.lastTestMessage ?? undefined}>Connection failed</span>}
                </div>
                <p className="muted" style={{ fontSize: 11, margin: "2px 0 0" }}>
                  {d.type === "EMAIL" ? d.emailTo : `${d.s3Bucket}${d.s3PathPrefix ? `/${d.s3PathPrefix}` : ""} · ${d.s3Endpoint || "AWS S3"}`}
                  {d.lastTestAt && ` · tested ${dayjs(d.lastTestAt).format("DD MMM HH:mm")}`}
                </p>
              </div>
              <PermissionGate module="app-settings" action="edit">
                <div className="row gap-1">
                  <button className="btn btn-secondary btn-sm" disabled={testDestinationMutation.isPending} onClick={() => testDestinationMutation.mutate(d.id)}>
                    Test Connection
                  </button>
                  <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => setEditingDestination(d)}>
                    <Icon name="edit" size={12} />
                  </button>
                  <PermissionGate module="app-settings" action="delete">
                    <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => setDeletingDestination(d)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </PermissionGate>
                </div>
              </PermissionGate>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="mt-0">Run History</h3>
        <DataTable
          tableId="appSettings.backupRuns"
          exportModule="app-settings"
          defaultViewMode="list"
          columns={runColumns}
          data={runsPage?.runs ?? []}
          isLoading={runsLoading}
          emptyMessage="No backups have run yet."
          // This table only ever holds one server page of runs (Prev/Next below manage runPage
          // directly), so DataTable's own client-side search would silently search just the
          // visible page instead of full history — disabled until real server-side search exists.
          searchable={false}
        />
        {runsPage && runsPage.total > runsPage.pageSize && (
          <div className="row gap-2" style={{ justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={runPage <= 1} onClick={() => setRunPage((p) => p - 1)}>‹ Prev</button>
            <span className="muted" style={{ fontSize: 12 }}>Page {runsPage.page} of {Math.max(1, Math.ceil(runsPage.total / runsPage.pageSize))}</span>
            <button className="btn btn-secondary btn-sm" disabled={runPage * runsPage.pageSize >= runsPage.total} onClick={() => setRunPage((p) => p + 1)}>Next ›</button>
          </div>
        )}
      </div>

      {(showAddDestination || editingDestination) && (
        <DestinationFormModal
          destination={editingDestination}
          onClose={() => { setShowAddDestination(false); setEditingDestination(null); }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["backup-destinations"] })}
        />
      )}

      {deletingDestination && (
        <ConfirmDialog
          title="Delete destination"
          message={`Delete "${deletingDestination.name}"? Future backups will no longer be sent here. This cannot be undone.`}
          danger
          loading={deleteDestinationMutation.isPending}
          onCancel={() => setDeletingDestination(null)}
          onConfirm={() => deleteDestinationMutation.mutate(deletingDestination.id)}
        />
      )}

      {showPublishModal && draft && (
        <PublishOrScheduleModal
          title="Save Backup Schedule"
          changeType="BACKUP_SETTINGS"
          payload={draft as unknown as Record<string, unknown>}
          onPublishNow={async () => { await saveSettingsMutation.mutateAsync(draft); }}
          publishing={saveSettingsMutation.isPending}
          onScheduled={() => setShowPublishModal(false)}
          onClose={() => setShowPublishModal(false)}
        />
      )}
    </div>
  );
}

function DestinationFormModal({ destination, onClose, onSaved }: { destination: BackupDestination | null; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"EMAIL" | "S3">(destination?.type ?? "EMAIL");
  const [name, setName] = useState(destination?.name ?? "");
  const [isEnabled, setIsEnabled] = useState(destination?.isEnabled ?? true);
  const [emailTo, setEmailTo] = useState(destination?.emailTo ?? "");
  const [s3Endpoint, setS3Endpoint] = useState(destination?.s3Endpoint ?? "");
  const [s3Region, setS3Region] = useState(destination?.s3Region ?? "");
  const [s3Bucket, setS3Bucket] = useState(destination?.s3Bucket ?? "");
  const [s3AccessKeyId, setS3AccessKeyId] = useState(destination?.s3AccessKeyId ?? "");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [s3PathPrefix, setS3PathPrefix] = useState(destination?.s3PathPrefix ?? "");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(destination?.s3ForcePathStyle ?? false);

  const mutation = useMutation({
    mutationFn: () => {
      const body =
        type === "EMAIL"
          ? { type, name, isEnabled, emailTo }
          : { type, name, isEnabled, s3Endpoint: s3Endpoint || undefined, s3Region: s3Region || undefined, s3Bucket, s3AccessKeyId, s3SecretAccessKey: s3SecretAccessKey || undefined, s3PathPrefix: s3PathPrefix || undefined, s3ForcePathStyle };
      return destination ? axiosClient.patch(`/backups/destinations/${destination.id}`, body) : axiosClient.post("/backups/destinations", body);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  const canSubmit = name.trim() && (type === "EMAIL" ? emailTo.trim() : s3Bucket.trim() && s3AccessKeyId.trim() && (destination || s3SecretAccessKey.trim()));

  return (
    <FormModal title={destination ? "Edit Destination" : "Add Destination"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!canSubmit}>
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save this destination."}</div>}

      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly email, Backblaze bucket" /></div>

      <div className="field">
        <label>Type</label>
        <ChipSelect
          value={type}
          onChange={(v) => setType(v as "EMAIL" | "S3")}
          disabled={!!destination}
          options={[
            { value: "EMAIL", label: "Email" },
            { value: "S3", label: "Online Drive (S3-compatible: AWS S3, MinIO, Backblaze B2, DigitalOcean Spaces, Cloudflare R2, Wasabi)" },
          ]}
        />
      </div>

      <label className="row gap-2" style={{ cursor: "pointer", alignItems: "center" }}>
        <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
        Enabled
      </label>

      {type === "EMAIL" ? (
        <div className="field"><label>Send To *</label><input className="input" type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="backups@example.com" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2">
            <div className="field"><label>Bucket *</label><input className="input" value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} placeholder="my-backups-bucket" /></div>
            <div className="field"><label>Region</label><input className="input" value={s3Region} onChange={(e) => setS3Region(e.target.value)} placeholder="us-east-1" /></div>
          </div>
          <div className="field">
            <label>Endpoint <span className="muted">(leave blank for AWS S3)</span></label>
            <input className="input" value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="https://s3.eu-west-2.wasabisys.com" />
          </div>
          <div className="grid grid-cols-2">
            <div className="field"><label>Access Key ID *</label><input className="input" value={s3AccessKeyId} onChange={(e) => setS3AccessKeyId(e.target.value)} /></div>
            <div className="field">
              <label>Secret Access Key {destination ? <span className="muted">(leave blank to keep current)</span> : "*"}</label>
              <PasswordInput value={s3SecretAccessKey} onChange={(e) => setS3SecretAccessKey(e.target.value)} placeholder={destination ? "••••••••" : ""} />
            </div>
          </div>
          <div className="field"><label>Path Prefix <span className="muted">(optional)</span></label><input className="input" value={s3PathPrefix} onChange={(e) => setS3PathPrefix(e.target.value)} placeholder="kynren/backups" /></div>
          <label className="row gap-2" style={{ cursor: "pointer", alignItems: "center" }}>
            <input type="checkbox" checked={s3ForcePathStyle} onChange={(e) => setS3ForcePathStyle(e.target.checked)} />
            Force path-style addressing <span className="muted">(needed for most self-hosted MinIO setups)</span>
          </label>
        </>
      )}
    </FormModal>
  );
}
