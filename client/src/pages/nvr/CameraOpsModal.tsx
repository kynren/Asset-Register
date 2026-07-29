import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";

interface Recording {
  id: number;
  filePath: string;
  startedAt: string;
  endedAt: string | null;
  sizeBytes: number | null;
  trigger: string;
}

interface RecordingsResponse {
  recordings: Recording[];
  active: { recordingId: number; failed: boolean; failMessage: string | null } | null;
}

interface MotionStatus {
  status: "connecting" | "watching" | "error" | "stopped";
  error: string | null;
  eventsSeen: number;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The download route requires the app's Bearer token, which a plain <a href> can't attach —
// fetch it as an authenticated blob instead, same pattern used for asset report/PDF downloads.
async function downloadRecording(id: number, cameraName: string, startedAt: string) {
  const res = await axiosClient.get(`/nvr/recordings/${id}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cameraName}-${dayjs(startedAt).format("YYYYMMDD-HHmmss")}.mp4`;
  a.click();
  window.URL.revokeObjectURL(url);
}

export function CameraOpsModal({ cameraId, cameraName, onClose }: { cameraId: number; cameraName: string; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: recordingsData } = useQuery({
    queryKey: ["camera-recordings", cameraId],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${cameraId}/recordings`)).data as RecordingsResponse,
    refetchInterval: 5000,
  });

  const { data: motionStatus } = useQuery({
    queryKey: ["camera-motion-watch", cameraId],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${cameraId}/motion-watch`)).data as MotionStatus,
    refetchInterval: 5000,
  });

  const invalidateRecordings = () => queryClient.invalidateQueries({ queryKey: ["camera-recordings", cameraId] });
  const invalidateMotion = () => queryClient.invalidateQueries({ queryKey: ["camera-motion-watch", cameraId] });

  const startRecordingMutation = useMutation({
    mutationFn: () => axiosClient.post(`/nvr/cameras/${cameraId}/recordings/start`, { trigger: "MANUAL" }),
    onSuccess: invalidateRecordings,
  });
  const stopRecordingMutation = useMutation({
    mutationFn: () => axiosClient.post(`/nvr/cameras/${cameraId}/recordings/stop`),
    onSuccess: invalidateRecordings,
  });

  const startMotionMutation = useMutation({
    mutationFn: async () => (await axiosClient.post<{ status: string; message: string }>(`/nvr/cameras/${cameraId}/motion-watch/start`)).data,
    onSuccess: invalidateMotion,
  });
  const stopMotionMutation = useMutation({
    mutationFn: () => axiosClient.post(`/nvr/cameras/${cameraId}/motion-watch/stop`),
    onSuccess: invalidateMotion,
  });

  const active = recordingsData?.active;

  return (
    <FormModal title={`Camera Ops — ${cameraName}`} onClose={onClose} hideFooter maxWidth={620}>
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: "0 0 4px" }}>Recording</h4>
        <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
          Records the camera's live stream to disk via ffmpeg. Requires ffmpeg on the server PATH and a reachable stream URL.
        </p>
        {active ? (
          <div className={`alert ${active.failed ? "alert-danger" : "alert-success"}`} style={{ marginBottom: 10 }}>
            {active.failed ? active.failMessage : `Recording #${active.recordingId} in progress...`}
          </div>
        ) : startRecordingMutation.isError ? (
          <div className="alert alert-danger" style={{ marginBottom: 10 }}>
            {(startRecordingMutation.error as any)?.response?.data?.error ?? "Could not start recording."}
          </div>
        ) : null}
        <div className="row gap-2">
          <button className="btn btn-primary btn-sm" disabled={!!active || startRecordingMutation.isPending} onClick={() => startRecordingMutation.mutate()}>
            <Icon name="camera" size={13} /> Start Recording
          </button>
          <button className="btn btn-danger btn-sm" disabled={!active || stopRecordingMutation.isPending} onClick={() => stopRecordingMutation.mutate()}>
            Stop Recording
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {recordingsData?.recordings.length ? (
            <table className="ad-table">
              <thead><tr><th>Started</th><th>Duration</th><th>Size</th><th>Trigger</th><th></th></tr></thead>
              <tbody>
                {recordingsData.recordings.map((r) => (
                  <tr key={r.id}>
                    <td>{dayjs(r.startedAt).format("DD MMM HH:mm:ss")}</td>
                    <td>{r.endedAt ? `${dayjs(r.endedAt).diff(dayjs(r.startedAt), "second")}s` : "—"}</td>
                    <td>{formatBytes(r.sizeBytes)}</td>
                    <td>{r.trigger}</td>
                    <td>
                      {r.endedAt && (
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadRecording(r.id, cameraName, r.startedAt)}>
                          <Icon name="download" size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No recordings yet for this camera.</div>
          )}
        </div>
      </div>

      <div>
        <h4 style={{ margin: "0 0 4px" }}>Motion Detection</h4>
        <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
          Subscribes to the camera's real ONVIF motion/tamper event stream. Genuine events raise a notification —
          nothing is simulated.
        </p>
        {startMotionMutation.data?.status === "error" ? (
          <div className="alert alert-danger" style={{ marginBottom: 10 }}>{startMotionMutation.data.message}</div>
        ) : motionStatus && motionStatus.status !== "stopped" ? (
          <div className={`alert ${motionStatus.status === "error" ? "alert-danger" : "alert-success"}`} style={{ marginBottom: 10 }}>
            {motionStatus.status === "error" ? motionStatus.error : `Watching — ${motionStatus.eventsSeen} motion event(s) detected so far.`}
          </div>
        ) : null}
        <div className="row gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={motionStatus?.status === "watching" || startMotionMutation.isPending}
            onClick={() => startMotionMutation.mutate()}
          >
            Start Watching
          </button>
          <button
            className="btn btn-danger btn-sm"
            disabled={!motionStatus || motionStatus.status === "stopped" || stopMotionMutation.isPending}
            onClick={() => stopMotionMutation.mutate()}
          >
            Stop Watching
          </button>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </FormModal>
  );
}
