import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface Recording {
  id: number;
  filePath: string;
  startedAt: string;
  endedAt: string | null;
  sizeBytes: number | null;
  trigger: string;
  camera: { id: number; name: string; nvr: { id: number; name: string } };
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadRecording(id: number, filename: string) {
  const res = await axiosClient.get(`/nvr/recordings/${id}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Aggregates real CameraRecording rows across every camera — the same ffmpeg-based recordings
// already produced by the Ops modal's Start/Stop Recording controls, just surfaced here as a
// dedicated playback/download center instead of per-camera.
export function NvrPlaybackCenterTab() {
  const { data: recordings, isLoading } = useQuery({
    queryKey: ["nvr-recordings-all"],
    queryFn: async () => (await axiosClient.get("/nvr/recordings")).data as Recording[],
  });

  return (
    <div className="ad-shell nvx-shell" style={{ padding: 22 }}>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="fileText" size={16} /> NVR Playback Center</h2>
        <p className="ad-content-subtitle">Every recording captured across all cameras, most recent first. Start/stop recording from a camera's Ops panel in Config Server.</p>
      </div>

      <div className="ad-panel">
        {isLoading ? (
          <div className="ad-empty">Loading recordings...</div>
        ) : recordings && recordings.length > 0 ? (
          <table className="ad-table">
            <thead>
              <tr>
                <th>Camera</th>
                <th>NVR</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Size</th>
                <th>Trigger</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recordings.map((r) => (
                <tr key={r.id}>
                  <td>{r.camera.name}</td>
                  <td>{r.camera.nvr.name}</td>
                  <td>{dayjs(r.startedAt).format("DD MMM YYYY, HH:mm:ss")}</td>
                  <td>{r.endedAt ? dayjs(r.endedAt).format("DD MMM YYYY, HH:mm:ss") : <span className="ad-badge ad-badge-warning">Recording</span>}</td>
                  <td>{formatBytes(r.sizeBytes)}</td>
                  <td><span className="ad-badge ad-badge-neutral">{r.trigger}</span></td>
                  <td>
                    <button
                      className="ad-btn"
                      disabled={!r.endedAt}
                      title={r.endedAt ? "Download" : "Still recording"}
                      onClick={() => downloadRecording(r.id, `${r.camera.name}-${dayjs(r.startedAt).format("YYYYMMDD-HHmmss")}.mp4`)}
                    >
                      <Icon name="download" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ad-empty">No recordings yet. Start one from a camera's Ops panel in Config Server.</div>
        )}
      </div>
    </div>
  );
}
